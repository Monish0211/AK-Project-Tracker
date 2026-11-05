import { AppError } from "../../shared/utils/AppError.js";
import { formatMoney } from "../invoicePayments/money.rules.js";

/**
 * Invoice-level GST snapshot (Nov 2026) - pure rules. No database, no clock.
 *
 * WHAT A SNAPSHOT IS: the GST that applied when an invoice was first raised, frozen per invoice. Record Payment settles against
 * "taxable value + this saved GST", so a later change of a project-level GST setting can never move an invoice's settlement target.
 *
 * THREE STATES THAT MUST NEVER BE CONFUSED
 *   - no snapshot row            -> LEGACY invoice: GST unknown, the settlement target stays the taxable value (nothing is assumed);
 *   - gstStatus NOT_APPLICABLE   -> the invoice explicitly carries no GST;
 *   - gstStatus APPLICABLE       -> GST applies at ratePercent, which may legitimately be 0 (applicable at 0%).
 *
 * ROUNDING (confirmed decision): the GST amount is computed with EXACTLY the arithmetic the invoice screens and the printout already
 * use - round(value) = Math.round(value * 100) / 100 on the doubles, IGST = round(subtotal * rate/100), CGST = SGST = round(subtotal *
 * rate/200) - so the saved figure always equals what the user saw and printed. That arithmetic runs once, at raise time; the result is
 * converted to exact integer paise immediately and every later calculation (settlement, comparison, totals) is integer BigInt.
 */

export type GstStatus = "APPLICABLE" | "NOT_APPLICABLE";
export type GstTaxType = "IGST" | "CGST_SGST";

export const RAISED_STATUSES = ["Raised", "PartiallyPaid", "Paid"] as const;
export const isRaisedStatus = (status: string): boolean => (RAISED_STATUSES as readonly string[]).includes(status);

/** What a client says about an invoice's GST when it raises it. The server never trusts amounts - it recomputes and compares. */
export interface GstDeclaration {
  applicable: boolean;
  ratePercent?: number | undefined;
  taxType?: GstTaxType | undefined;
  buyerStateKnown?: boolean | undefined;
  /** The GST amount the client displayed; optional cross-check only (never stored). */
  expectedGstAmount?: number | undefined;
}

/** The frozen settings of a snapshot (everything except the amounts, which follow the invoice lines). */
export interface GstSettings {
  status: GstStatus;
  /** Decimal string with 4 places ("18.0000"), null when NOT_APPLICABLE. */
  ratePercent: string | null;
  taxType: GstTaxType | null;
  buyerStateKnown: boolean;
}

export interface GstAmountsMinor {
  taxableMinor: bigint;
  cgstMinor: bigint;
  sgstMinor: bigint;
  igstMinor: bigint;
  gstMinor: bigint;
  totalMinor: bigint;
}

/** The screen's own helper (InvoiceCalculations.ts round). Kept identical on purpose - see the header. */
export const roundLikeScreen = (value: number): number => Math.round(value * 100) / 100;

/** Same function as the frontend's computeGstTax(): tax on a subtotal in INR, split by tax type. Returns numbers in rupees. */
export function computeGstTaxLikeScreen(subtotal: number, ratePercent: number, isInterState: boolean): { cgst: number; sgst: number; igst: number; totalTax: number } {
  if (isInterState) {
    const igst = roundLikeScreen(subtotal * (ratePercent / 100));
    return { cgst: 0, sgst: 0, igst, totalTax: igst };
  }
  const cgst = roundLikeScreen(subtotal * (ratePercent / 200));
  const sgst = roundLikeScreen(subtotal * (ratePercent / 200));
  return { cgst, sgst, igst: 0, totalTax: roundLikeScreen(cgst + sgst) };
}

/** Exact paise from a rupee double that is already rounded to 2 decimals. */
const paise = (rupees: number): bigint => BigInt(Math.round(rupees * 100));

/**
 * GST is INR-only (the portal's existing rule: a foreign invoice never carries GST). It is chosen on the INVOICE itself, when it is raised:
 * the project's own GST switch / rate in the Quantity section (Project.gstApplicable) is deliberately NOT consulted - the two are independent.
 */
export function isGstEligible(input: { invoiceCurrency: string }): boolean {
  return input.invoiceCurrency === "INR";
}

/** A rate is 0..100 with at most 4 decimals (the column is Decimal(7,4)). Returns the stored decimal string. */
export function normalizeRate(rate: unknown): string {
  if (typeof rate !== "number" || !Number.isFinite(rate)) throw new AppError("GST rate must be a number.", 400);
  if (rate < 0 || rate > 100) throw new AppError("GST rate must be between 0 and 100.", 400);
  if (Math.abs(rate * 10000 - Math.round(rate * 10000)) > 1e-7) throw new AppError("GST rate can have at most 4 decimal places.", 400);
  return rate.toFixed(4);
}

/**
 * The settings a NEW snapshot starts with.
 *   - invoice NOT eligible (a foreign currency) -> NOT_APPLICABLE, decided by the server (a client claiming GST applies is refused);
 *   - eligible (INR) -> what the user declared on the invoice: "GST applies" needs an explicit rate (0% is valid) and tax type, nothing is
 *     ever assumed; "no GST" is its own explicit choice. A write that carries no declaration at all (a non-screen writer) records NO GST -
 *     the portal screens always send an explicit choice, so a user can never skip it by accident.
 */
export function settingsForNewSnapshot(input: { eligible: boolean; declaration: GstDeclaration | undefined }): GstSettings {
  const { eligible, declaration } = input;
  if (!eligible) {
    if (declaration?.applicable) {
      throw new AppError("GST cannot be applied to this invoice: GST applies to INR invoices only.", 400);
    }
    return { status: "NOT_APPLICABLE", ratePercent: null, taxType: null, buyerStateKnown: false };
  }
  if (!declaration || !declaration.applicable) {
    return { status: "NOT_APPLICABLE", ratePercent: null, taxType: null, buyerStateKnown: false };
  }
  if (declaration.taxType !== "IGST" && declaration.taxType !== "CGST_SGST") {
    throw new AppError("Select the GST tax type (IGST or CGST + SGST) to raise this invoice.", 400);
  }
  return { status: "APPLICABLE", ratePercent: normalizeRate(declaration.ratePercent), taxType: declaration.taxType, buyerStateKnown: declaration.buyerStateKnown === true };
}

/** Taxable minor units + frozen settings -> every amount of the snapshot, as exact integers. */
export function computeSnapshotAmounts(taxableMinor: bigint, settings: GstSettings): GstAmountsMinor {
  if (settings.status === "NOT_APPLICABLE") {
    return { taxableMinor, cgstMinor: 0n, sgstMinor: 0n, igstMinor: 0n, gstMinor: 0n, totalMinor: taxableMinor };
  }
  const rate = Number(settings.ratePercent);
  const subtotal = Number(taxableMinor) / 100;
  const split = computeGstTaxLikeScreen(subtotal, rate, settings.taxType === "IGST");
  const cgstMinor = paise(split.cgst);
  const sgstMinor = paise(split.sgst);
  const igstMinor = paise(split.igst);
  // totalTax is round(cgst + sgst): the two already-rounded halves, so integer addition gives exactly the same paise.
  const gstMinor = cgstMinor + sgstMinor + igstMinor;
  return { taxableMinor, cgstMinor, sgstMinor, igstMinor, gstMinor, totalMinor: taxableMinor + gstMinor };
}

/** Rejects a declaration whose displayed GST amount disagrees with the server's own calculation (a client/server drift or tampering). */
export function assertDeclaredGstMatches(declaration: GstDeclaration | undefined, amounts: GstAmountsMinor): void {
  if (declaration?.expectedGstAmount === undefined) return;
  if (paise(roundLikeScreen(declaration.expectedGstAmount)) !== amounts.gstMinor) {
    throw new AppError(
      `The GST amount shown (${declaration.expectedGstAmount.toFixed(2)}) does not match the amount calculated by the server (${formatMoney(amounts.gstMinor, "INR")}). Please refresh the page and try again.`,
      409
    );
  }
}
