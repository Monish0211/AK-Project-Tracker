/**
 * Invoice Edit / Delete approval rights (Oct 2026) — pure, DB-free rule for
 * deciding whether a PATCH /invoice-lines/:id actually EDITS an invoice's
 * content (and so requires the "Edit Invoice" approval), or only changes its
 * status (which keeps its own, separate rules — confirmed business decision:
 * marking Paid / Partially Paid / Cancelled does not need Edit Invoice, and
 * raising still needs Raise Invoice).
 *
 * The frontend re-sends a line's FULL payload on every PATCH, including a
 * status-only update from Invoice History, so a field counts as changed only
 * when its value genuinely differs from what is stored — never merely
 * because it is present. Fields absent from the request are never changes.
 */

export interface StoredInvoiceLineContent {
  invoiceNo: string;
  invoiceDate: Date;
  milestoneId: string | null;
  milestoneName: string | null;
  setIndex: number | null;
  description: string | null;
  quantityBilled: number;
  invoiceAmountINR: number;
  invoiceAmountOriginal: number | null;
  currency: string;
  exchangeRateToINR: number;
  clientReference: string | null;
  remarks: string | null;
}

export interface InvoiceLineContentInput {
  invoiceNo?: string | undefined;
  invoiceDate?: Date | undefined;
  milestoneId?: string | null | undefined;
  milestoneName?: string | null | undefined;
  setIndex?: number | null | undefined;
  description?: string | null | undefined;
  quantityBilled?: number | undefined;
  invoiceAmountINR?: number | undefined;
  invoiceAmountOriginal?: number | undefined;
  currency?: string | undefined;
  exchangeRateToINR?: number | undefined;
  clientReference?: string | null | undefined;
  remarks?: string | null | undefined;
}

const AMOUNT_TOLERANCE = 0.005; // below one paisa / one minor unit (OMR: 0.001 is still caught)
const ORIGINAL_TOLERANCE = 0.0005;

const text = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};
const day = (value: Date): string => value.toISOString().slice(0, 10);

/** Returns the names of the content fields this PATCH would change (empty = status-only or no-op). */
export function changedInvoiceContentFields(existing: StoredInvoiceLineContent, input: InvoiceLineContentInput): string[] {
  const changed: string[] = [];
  if (input.invoiceNo !== undefined && input.invoiceNo.trim() !== existing.invoiceNo.trim()) changed.push("invoiceNo");
  if (input.invoiceDate !== undefined && day(input.invoiceDate) !== day(existing.invoiceDate)) changed.push("invoiceDate");
  if (input.milestoneId !== undefined && text(input.milestoneId) !== text(existing.milestoneId)) changed.push("milestoneId");
  if (input.milestoneName !== undefined && text(input.milestoneName) !== text(existing.milestoneName)) changed.push("milestoneName");
  if (input.setIndex !== undefined && (input.setIndex ?? null) !== (existing.setIndex ?? null)) changed.push("setIndex");
  if (input.description !== undefined && text(input.description) !== text(existing.description)) changed.push("description");
  if (input.quantityBilled !== undefined && Math.abs(input.quantityBilled - existing.quantityBilled) > 1e-9) changed.push("quantityBilled");
  if (input.invoiceAmountINR !== undefined && Math.abs(input.invoiceAmountINR - existing.invoiceAmountINR) > AMOUNT_TOLERANCE) {
    changed.push("invoiceAmountINR");
  }
  if (
    input.invoiceAmountOriginal !== undefined &&
    Math.abs(input.invoiceAmountOriginal - (existing.invoiceAmountOriginal ?? existing.invoiceAmountINR)) > ORIGINAL_TOLERANCE
  ) {
    changed.push("invoiceAmountOriginal");
  }
  if (input.currency !== undefined && input.currency !== existing.currency) changed.push("currency");
  if (input.exchangeRateToINR !== undefined && input.exchangeRateToINR !== existing.exchangeRateToINR) changed.push("exchangeRateToINR");
  if (input.clientReference !== undefined && text(input.clientReference) !== text(existing.clientReference)) changed.push("clientReference");
  if (input.remarks !== undefined && text(input.remarks) !== text(existing.remarks)) changed.push("remarks");
  return changed;
}
