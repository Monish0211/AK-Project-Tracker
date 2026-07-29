import type { InvoiceItem } from "../../../../types/InvoiceItem";
import { getEditableMaxQuantity } from "./InvoiceCalculations";

/**
 * Inline validation for the Raise Invoice drawer. Every rule here maps to a
 * spec requirement:
 *  - "Prevent Invoice Qty > Completed Qty" / "Prevent duplicate billing
 *    beyond contract quantity" — both collapse to the same real constraint:
 *    a line can never bill more than what's still remaining on the activity
 *    (contract qty minus every other non-cancelled line already recorded).
 *  - "Prevent negative balance" — enforced by the same bound, since a qty
 *    within it can never drive Remaining Qty/Amount below zero.
 */
export function validateInvoiceLineQuantity(
  item: InvoiceItem,
  quantity: number,
  excludeLineId?: string
): string | null {
  if (quantity < 0) {
    return "Quantity cannot be negative.";
  }

  const maxQty = getEditableMaxQuantity(item, excludeLineId);

  if (quantity > maxQty + 0.0001) {
    return `Cannot exceed the remaining available quantity (${maxQty} ${item.uom}).`;
  }

  return null;
}

export interface InvoiceHeaderInput {
  invoiceNo: string;
  invoiceDate: string;
}

export function validateInvoiceHeader(input: InvoiceHeaderInput): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!input.invoiceNo.trim()) {
    errors.invoiceNo = "Invoice Number is required.";
  }
  if (!input.invoiceDate.trim()) {
    errors.invoiceDate = "Invoice Date is required.";
  }

  return errors;
}

/** At least one billable line must actually carry a quantity before the invoice can be saved. */
export function hasAtLeastOneBillableLine(quantities: number[]): boolean {
  return quantities.some((qty) => qty > 0);
}
