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

  /** Invoice Currency feature (Oct 2026) — see schema.prisma's InvoiceLine comment. invoiceAmountINR above stays authoritative; these are descriptive only. */
  currency?: string;
  exchangeRateToINR?: number;
  invoiceAmountOriginal?: number | null;
  /**
   * Multi-country invoice currency (Phase 5): the project-currency side of a line on a non-INR project (all undefined for an INR / legacy project, whose
   * invoiceAmountINR is its project amount). Decimals are passed as exact decimal text. The INR-named fields above hold 0 / 1 for such a line.
   */
  projectCurrency?: string | null;
  exchangeRateToProject?: string | null;
  invoiceAmountProject?: string | null;
  unitPriceProject?: string | null;
  calculatedAmountProject?: string | null;
  commercialAdjustmentProject?: string | null;

  clientReference?: string | null;
  remarks?: string | null;

  status: string;
  createdBy: string;
}
