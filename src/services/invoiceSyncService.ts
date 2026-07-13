import type { QuantityItem } from "../types/QuantityItem";
import type { InvoiceItem } from "../types/InvoiceItem";

/**
 * Invoice line items mirror Quantity Details activities 1:1 (matched by id).
 * Description, Qty, UOM and Unit Price (INR) always come from the matching
 * Quantity item; only the raised-invoice history is owned by the Invoice tab
 * and preserved across re-syncs.
 */
export function syncInvoiceItemsWithQuantity(
  quantityItems: QuantityItem[],
  invoiceItems: InvoiceItem[]
): InvoiceItem[] {
  const safeQuantityItems = Array.isArray(quantityItems) ? quantityItems : [];
  const safeInvoiceItems = Array.isArray(invoiceItems) ? invoiceItems : [];

  return safeQuantityItems.map((quantityItem) => {
    const existing = safeInvoiceItems.find(
      (invoiceItem) => invoiceItem.id === quantityItem.id
    );

    const qty = quantityItem.woQty || 0;
    const unitPrice = quantityItem.unitRateINR || 0;

    return {
      id: quantityItem.id,
      description: quantityItem.description,
      qty,
      uom: quantityItem.uom || "DAY",
      unitPrice,
      totalPrice: quantityItem.woValue || 0,
      invoices: existing?.invoices ?? [],
    };
  });
}
