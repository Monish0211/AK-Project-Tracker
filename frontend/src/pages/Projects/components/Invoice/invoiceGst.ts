import type { InvoiceCurrency, InvoiceGstSelection, InvoiceGstTaxType, InvoiceLineStatus } from "../../../../types/InvoiceItem";
import type { Project } from "../../../../types/Project";
import {
  findInvoiceGstSnapshot,
  getSavedBuyerState,
  invoiceHasRaisedLine,
  isGstSelectableForInvoice,
  isInterStateSupply,
  isRaisedInvoiceStatus,
} from "./InvoiceCalculations";

/**
 * Invoice-level GST snapshot (Nov 2026) — the rules for CHOOSING an invoice's GST, shared by the four Raise Invoice workspaces, the Edit
 * Invoice drawer, the Invoice History status control and the one place that saves it (invoiceLineActions.ts). Pure functions: the screen
 * only displays them, and the server validates and recalculates everything again.
 *
 * GST is entered ON THE INVOICE, independently of the project's Quantity-section GST switch and rate (those stay a project-level setting
 * and are never consulted here). What the user chooses is fixed the first time the invoice is raised (the server then freezes it in the
 * invoice's snapshot):
 * - "No GST", or a RATE (0, 5, 12, 18, 28 or any custom 0-100%) with a TAX TYPE (IGST, or CGST + SGST);
 * - nothing is prefilled: no rate is suggested from the project, and the tax type is suggested ONLY when the buyer state is already saved
 *   for the invoice - nothing is ever assumed (in particular never "Tamil Nadu"), the user must choose;
 * - a choice is needed for every INR invoice that has no snapshot yet and no line ever raised (an invoice already raised before snapshots
 *   existed is LEGACY: it is never given one). Foreign-currency invoices never carry GST and are never asked.
 */

export const GST_RATE_PRESETS = [0, 5, 12, 18, 28] as const;
export const CUSTOM_RATE_CHOICE = "custom";
/** The rate dropdown's value for an explicit "this invoice carries no GST". */
export const NO_GST_CHOICE = "none";

export const GST_TAX_TYPE_LABEL: Record<InvoiceGstTaxType, string> = {
  IGST: "IGST (inter-state)",
  CGST_SGST: "CGST + SGST (intra-state)",
};

/** "IGST" / "CGST + SGST" — the tax treatment saved with an invoice ("-" when GST does not apply). */
export function gstTaxTypeLabel(taxType: InvoiceGstTaxType | null): string {
  return taxType === "IGST" ? "IGST" : taxType === "CGST_SGST" ? "CGST + SGST" : "-";
}

/** A typed rate: a number 0-100 with at most four decimals (the server's own rule), or null. */
export function parseGstRate(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,3}(\.\d{1,4})?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= 0 && value <= 100 ? value : null;
}

/** The tax type implied by a buyer state that is already saved for this invoice, or null when there is none — never a default. */
export function suggestedGstTaxType(project: Project, invoiceNo: string): InvoiceGstTaxType | null {
  const buyerState = getSavedBuyerState(project, invoiceNo);
  if (!buyerState) return null;
  return isInterStateSupply(buyerState) ? "IGST" : "CGST_SGST";
}

/**
 * True when this invoice has NO GST choice yet and must be given one (a rate and tax type, or "No GST") before it can be raised. An
 * invoice whose Draft already carries its GST choice is not asked again.
 */
export function isGstChoiceNeeded(project: Project, invoiceNo: string, invoiceCurrency: InvoiceCurrency): boolean {
  return isGstSelectableForInvoice(invoiceCurrency) && !findInvoiceGstSnapshot(project, invoiceNo) && !invoiceHasRaisedLine(project, invoiceNo);
}

/** True while the invoice's GST can still be chosen or changed: an INR invoice that has not been raised yet (with or without a saved choice). */
export function isGstChoiceEditable(project: Project, invoiceNo: string, invoiceCurrency: InvoiceCurrency): boolean {
  return isGstSelectableForInvoice(invoiceCurrency) && !invoiceHasRaisedLine(project, invoiceNo);
}

/**
 * True for a raised INR invoice that has no GST snapshot on a project whose GST switch is on: raised before snapshots existed, so no GST
 * details are recorded for it. (The switch only decides whether the explanatory note is worth showing; it never decides any amount.)
 */
export function isLegacyGstInvoice(project: Project, invoiceNo: string, invoiceCurrency: InvoiceCurrency): boolean {
  return Boolean(project.gstApplicable) && isGstSelectableForInvoice(invoiceCurrency) && !findInvoiceGstSnapshot(project, invoiceNo) && invoiceHasRaisedLine(project, invoiceNo);
}

/** A complete choice, or null while it is incomplete: "No GST", or a valid rate AND an explicit tax type. */
export function buildGstSelection(rateText: string, taxType: InvoiceGstTaxType | "", buyerStateKnown: boolean, noGst = false): InvoiceGstSelection | null {
  if (noGst) return { applicable: false };
  const ratePercent = parseGstRate(rateText);
  if (ratePercent === null || (taxType !== "IGST" && taxType !== "CGST_SGST")) return null;
  return { applicable: true, ratePercent, taxType, buyerStateKnown };
}

export const GST_CHOICE_REQUIRED_MESSAGE =
  "Choose the GST for this invoice before raising it: No GST, or a rate and the tax type (IGST or CGST + SGST). It is fixed once the invoice is raised.";

/** Why an invoice cannot be saved in this status yet because its GST choice is missing, or null. A Draft never needs one. */
export function gstChoiceBlocker(args: { needed: boolean; status: InvoiceLineStatus | ""; selection: InvoiceGstSelection | null }): string | null {
  if (!args.needed || args.selection) return null;
  return args.status !== "" && isRaisedInvoiceStatus(args.status) ? GST_CHOICE_REQUIRED_MESSAGE : null;
}

const keyOf = (invoiceNo: string) => invoiceNo.trim().toUpperCase();

/**
 * The central guard (invoiceLineActions.ts): the first invoice in a save that goes from not-raised to raised, needs a GST choice and has
 * none — or null when every such invoice is covered. Mirrors the server's rule so a save is refused here with a clear message instead of
 * failing half way:
 * - an invoice that already had a raised line is skipped (it has its snapshot, or it is a legacy invoice that never gets one);
 * - a line moved from another invoice number is skipped when that invoice was raised (the server carries its snapshot / legacy state over);
 * - a foreign-currency invoice is skipped (it never carries GST).
 */
export function findInvoiceMissingGstChoice(project: Project, updatedProject: Project, selections: Record<string, InvoiceGstSelection> | undefined): string | null {
  const previousLines = (project.invoiceItems ?? []).flatMap((item) => item.invoices ?? []);
  const previousLineById = new Map(previousLines.map((line) => [line.id, line]));
  const previouslyRaised = new Set(previousLines.filter((line) => isRaisedInvoiceStatus(line.status)).map((line) => keyOf(line.invoiceNo)));

  for (const line of (updatedProject.invoiceItems ?? []).flatMap((item) => item.invoices ?? [])) {
    if (!isRaisedInvoiceStatus(line.status)) continue;
    const key = keyOf(line.invoiceNo);
    if (previouslyRaised.has(key) || selections?.[key]) continue;
    if (findInvoiceGstSnapshot(project, line.invoiceNo)) continue; // its Draft already carries the GST choice
    const before = previousLineById.get(line.id);
    if (before && (previouslyRaised.has(keyOf(before.invoiceNo)) || findInvoiceGstSnapshot(project, before.invoiceNo))) continue;
    if (!isGstSelectableForInvoice(line.currency ?? "INR")) continue;
    return line.invoiceNo;
  }
  return null;
}
