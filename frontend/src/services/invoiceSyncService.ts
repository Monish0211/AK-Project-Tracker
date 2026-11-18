import type { QuantityItem } from "../types/QuantityItem";
import type { InvoiceItem } from "../types/InvoiceItem";

/**
 * Invoice line items mirror Quantity Details activities 1:1 (matched by id).
 * Description, Qty, UOM and Unit Price (INR) always come from the matching
 * Quantity item; only the raised-invoice history is owned by the Invoice tab
 * and preserved across re-syncs.
 *
 * Multi-country: for a project whose own currency is not INR (`regionalCurrency`), the unit price and total are the activity's REGIONAL figures (its INR-named
 * ones are 0 by design). It is display only: the contract values the Invoice tab shows for such a project are in its own currency. Omitted / INR: the long-standing
 * INR figures, unchanged.
 */
export function syncInvoiceItemsWithQuantity(
  quantityItems: QuantityItem[],
  invoiceItems: InvoiceItem[],
  regionalCurrency?: string | null | undefined
): InvoiceItem[] {
  const regional = typeof regionalCurrency === "string" && regionalCurrency !== "" && regionalCurrency !== "INR";
  const safeQuantityItems = Array.isArray(quantityItems) ? quantityItems : [];
  const safeInvoiceItems = Array.isArray(invoiceItems) ? invoiceItems : [];

  return safeQuantityItems.map((quantityItem) => {
    const existing = safeInvoiceItems.find(
      (invoiceItem) => invoiceItem.id === quantityItem.id
    );

    const qty = quantityItem.woQty || 0;
    const unitPrice = regional ? quantityItem.unitRateRegional || 0 : quantityItem.unitRateINR || 0;

    return {
      id: quantityItem.id,
      description: quantityItem.description,
      qty,
      uom: quantityItem.uom || "DAY",
      unitPrice,
      totalPrice: regional ? quantityItem.woValueRegional || 0 : quantityItem.woValue || 0,
      invoices: existing?.invoices ?? [],
    };
  });
}
