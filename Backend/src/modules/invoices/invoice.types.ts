/**
 * Shared shapes reused across the Invoices module's layers — mirrors
 * quantity.types.ts's QuantityItemData / milestone.types.ts's MilestoneData.
 * Every InvoiceLine belongs to exactly one QuantityItem (see schema.prisma's
 * QuantityItem.invoiceLines / InvoiceLine.quantityItemId relation) — there is
 * deliberately no separate "InvoiceItem" row; that shape is derived at read
 * time (see services/invoice.service.ts).
 */
export interface InvoiceLineData {
  invoiceNo: string;
  invoiceDate: Date;

  milestoneId?: string | null;
  milestoneName?: string | null;
  setIndex?: number | null;

  description?: string | null;

  quantityBilled: number;

  unitPriceINR?: number | null;
  calculatedAmountINR?: number | null;
  invoiceAmountINR: number;
  commercialAdjustmentINR?: number | null;

  clientReference?: string | null;
  remarks?: string | null;

  status: string;
  createdBy: string;
}
