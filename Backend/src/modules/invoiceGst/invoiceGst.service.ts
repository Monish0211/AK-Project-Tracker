import type { Prisma } from "../../../generated/prisma/client.js";
import { AppError } from "../../shared/utils/AppError.js";
import { lockInvoiceNumber } from "../invoices/repository/invoice.repository.js";
import { floatToMinor, formatMoney, decimalToMinor } from "../invoicePayments/money.rules.js";
import { normalizeCurrency } from "../invoices/invoiceCurrency.rules.js";
import {
  assertDeclaredGstMatches,
  computeSnapshotAmounts,
  isGstEligible,
  isRaisedStatus,
  settingsForNewSnapshot,
} from "./invoiceGst.rules.js";
import type { GstAmountsMinor, GstDeclaration, GstSettings, GstStatus, GstTaxType } from "./invoiceGst.rules.js";
import {
  createSnapshot,
  findInvoiceLinesForSnapshot,
  findRegistry,
  updateSnapshot,
} from "./invoiceGst.repository.js";
import type { SnapshotRow, SnapshotWrite } from "./invoiceGst.repository.js";

/**
 * Invoice-level GST snapshot (Nov 2026) - keeps ONE snapshot per invoice in step with the invoice's lines, inside the SAME transaction
 * as the line write (so the invoice and its GST can never disagree), under the invoice-number advisory lock (so two lines of one invoice
 * written at the same moment cannot race each other's recalculation).
 *
 * The lifecycle (confirmed decisions, plus the Nov 2026 change that GST is entered once, on the invoice):
 *   - CREATED when the user declares the invoice's GST (on a Draft, or at the first raise) or, with no declaration, at the first raise. NEVER
 *     for an invoice that was already raised before this feature existed (a legacy invoice has no snapshot and keeps settling on its taxable
 *     value). A GST choice made while the invoice is still a Draft is saved, so the Draft -> Raised step never asks for it again;
 *   - EDITABLE only until the invoice is first raised (a new declaration on a never-raised invoice replaces the choice);
 *   - FROZEN from the first raise: rate and tax type never change again, whatever happens to the project's GST switch. Only the taxable
 *     amount and the GST totals are recomputed - from the invoice's own lines - whenever a line is created, edited, cancelled or deleted;
 *   - CARRIED when a line moves to a new invoice number (the new invoice inherits the frozen settings; the old one is recomputed), BEFORE the
 *     old register row is released - so an invoice can never silently lose its snapshot and fall back to ex-GST settlement.
 */

const activeLines = <T extends { status: string }>(lines: T[]) => lines.filter((line) => line.status !== "Cancelled");

/** How many lines of this invoice are already raised (any of Raised / Partially Paid / Paid). Read BEFORE a write to detect "first raise". */
export async function countRaisedLines(tx: Prisma.TransactionClient, projectId: string, invoiceNo: string): Promise<number> {
  await lockInvoiceNumber(invoiceNo, tx); // read under the invoice lock so two writers of one invoice see each other
  const lines = await findInvoiceLinesForSnapshot(projectId, invoiceNo, tx);
  return lines.filter((line) => isRaisedStatus(line.status)).length;
}

function settingsOf(snapshot: SnapshotRow): GstSettings {
  return {
    status: snapshot.gstStatus as GstStatus,
    ratePercent: snapshot.ratePercent === null ? null : snapshot.ratePercent.toFixed(4),
    taxType: (snapshot.taxType as GstTaxType | null) ?? null,
    buyerStateKnown: snapshot.buyerStateKnown,
  };
}

function toWrite(settings: GstSettings, currency: string, amounts: GstAmountsMinor): SnapshotWrite {
  const money = (minor: bigint) => formatMoney(minor, currency);
  return {
    gstStatus: settings.status,
    ratePercent: settings.ratePercent,
    taxType: settings.taxType,
    buyerStateKnown: settings.buyerStateKnown,
    currency,
    taxableAmount: money(amounts.taxableMinor),
    cgstAmount: money(amounts.cgstMinor),
    sgstAmount: money(amounts.sgstMinor),
    igstAmount: money(amounts.igstMinor),
    gstAmount: money(amounts.gstMinor),
    totalAmount: money(amounts.totalMinor),
  };
}

export interface SyncParams {
  projectId: string;
  invoiceNo: string;
  /** What the client declared for this write (only used to CREATE a snapshot at the first raise). */
  declaration?: GstDeclaration | undefined;
  /** Whether the invoice already had a raised line before this write. true => never create (legacy or already snapshotted). */
  hadRaisedBefore: boolean;
  /** A line was just moved here from this invoice number: inherit that invoice's frozen settings if this invoice has none yet. */
  inheritFromInvoiceNo?: string | undefined;
  actorName: string;
}

/**
 * Recomputes (or, at the first raise, creates) the snapshot of one invoice from its CURRENT lines. Call it inside the line-write
 * transaction, after the write. Does nothing for a Draft invoice, for a legacy invoice, or for an invoice with no register row.
 */
export async function syncInvoiceGstSnapshot(tx: Prisma.TransactionClient, params: SyncParams): Promise<void> {
  const { projectId, invoiceNo, declaration, hadRaisedBefore, inheritFromInvoiceNo, actorName } = params;
  await lockInvoiceNumber(invoiceNo, tx);

  const registry = await findRegistry(invoiceNo, tx);
  if (!registry || registry.projectId !== projectId) return; // a pre-register invoice: nothing can be attached to it

  const lines = activeLines(await findInvoiceLinesForSnapshot(projectId, invoiceNo, tx));
  if (lines.length === 0) return; // every line cancelled / deleted: the register row (and snapshot) goes with the invoice

  const currencies = new Set(lines.map((line) => normalizeCurrency(line.currency)));
  if (currencies.size !== 1) throw new AppError("This invoice has lines in more than one currency, so its GST cannot be calculated.", 409);
  const currency = [...currencies][0]!;
  let taxableMinor = 0n;
  for (const line of lines) taxableMinor += floatToMinor(line.invoiceAmountOriginal ?? line.invoiceAmountINR, currency);

  const existing = registry.gstSnapshot;
  if (existing) {
    // The settings are FROZEN once the invoice has been raised; while it never was (a Draft that already carries its GST choice) a new
    // declaration replaces the choice. The amounts always follow the lines.
    let settings = settingsOf(existing);
    let amounts = computeSnapshotAmounts(taxableMinor, settings);
    if (!hadRaisedBefore && declaration) {
      settings = settingsForNewSnapshot({ eligible: isGstEligible({ invoiceCurrency: currency }), declaration });
      amounts = computeSnapshotAmounts(taxableMinor, settings);
      assertDeclaredGstMatches(declaration, amounts);
    }
    await updateSnapshot(tx, existing.id, toWrite(settings, currency, amounts), actorName);
    return;
  }

  if (inheritFromInvoiceNo) {
    const source = await findRegistry(inheritFromInvoiceNo, tx);
    if (source?.gstSnapshot && source.projectId === projectId) {
      const settings = settingsOf(source.gstSnapshot);
      await createSnapshot(tx, registry.id, toWrite(settings, currency, computeSnapshotAmounts(taxableMinor, settings)), actorName);
      return;
    }
  }

  const raisedNow = lines.some((line) => isRaisedStatus(line.status));
  // A legacy invoice (already raised before this feature) never gets one. Otherwise a snapshot is made when the invoice is raised, or as soon
  // as the user declares its GST on a Draft (the choice is kept, so it is never asked for again at the raise).
  if (hadRaisedBefore || (!raisedNow && declaration === undefined)) return;

  const eligible = isGstEligible({ invoiceCurrency: currency });
  const settings = settingsForNewSnapshot({ eligible, declaration });
  const amounts = computeSnapshotAmounts(taxableMinor, settings);
  assertDeclaredGstMatches(declaration, amounts);
  await createSnapshot(tx, registry.id, toWrite(settings, currency, amounts), actorName);
}

/** The snapshot's amounts as exact minor units (for the settlement target). */
export function snapshotAmountsMinor(snapshot: SnapshotRow): GstAmountsMinor {
  const currency = snapshot.currency;
  return {
    taxableMinor: decimalToMinor(snapshot.taxableAmount, currency),
    cgstMinor: decimalToMinor(snapshot.cgstAmount, currency),
    sgstMinor: decimalToMinor(snapshot.sgstAmount, currency),
    igstMinor: decimalToMinor(snapshot.igstAmount, currency),
    gstMinor: decimalToMinor(snapshot.gstAmount, currency),
    totalMinor: decimalToMinor(snapshot.totalAmount, currency),
  };
}

/** The API shape of a snapshot (amounts as exact decimal strings in the invoice currency). */
export interface InvoiceGstSnapshotDto {
  gstStatus: GstStatus;
  ratePercent: string | null;
  taxType: GstTaxType | null;
  buyerStateKnown: boolean;
  currency: string;
  taxableAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  gstAmount: string;
  totalAmount: string;
}

export function toSnapshotDto(snapshot: SnapshotRow): InvoiceGstSnapshotDto {
  const money = (value: { toFixed(places: number): string }) => formatMoney(decimalToMinor(value, snapshot.currency), snapshot.currency);
  return {
    gstStatus: snapshot.gstStatus as GstStatus,
    // "18.0000" -> "18", "12.5000" -> "12.5": what the user selected, without the column's padding
    ratePercent: snapshot.ratePercent === null ? null : String(Number(snapshot.ratePercent.toFixed(4))),
    taxType: (snapshot.taxType as GstTaxType | null) ?? null,
    buyerStateKnown: snapshot.buyerStateKnown,
    currency: snapshot.currency,
    taxableAmount: money(snapshot.taxableAmount),
    cgstAmount: money(snapshot.cgstAmount),
    sgstAmount: money(snapshot.sgstAmount),
    igstAmount: money(snapshot.igstAmount),
    gstAmount: money(snapshot.gstAmount),
    totalAmount: money(snapshot.totalAmount),
  };
}
