/**
 * Request/response shapes for the Invoices module — same split as
 * quantity.dto.ts/milestone.dto.ts: response DTOs describe what the API
 * returns; Create/Update/Ingest DTOs describe what a request body carries.
 */
export interface CreateInvoiceLineDto {
  invoiceNo: string;
  invoiceDate: string;

  milestoneId?: string | null;
  milestoneName?: string | null;
  setIndex?: number | null;

  description?: string | null;

  quantityBilled: number;
  invoiceAmountINR: number;

  clientReference?: string | null;
  remarks?: string | null;

  status?: string;
  createdBy: string;
}

/** Same fields as CreateInvoiceLineDto, all optional — a PATCH only carries what changed. quantityItemId is never editable (identity, frozen at creation). */
export interface UpdateInvoiceLineDto {
  invoiceNo?: string;
  invoiceDate?: string;

  milestoneId?: string | null;
  milestoneName?: string | null;
  setIndex?: number | null;

  description?: string | null;

  quantityBilled?: number;
  invoiceAmountINR?: number;

  clientReference?: string | null;
  remarks?: string | null;

  status?: string;
}

export interface InvoiceLineDto {
  id: string;
  quantityItemId: string;

  invoiceNo: string;
  invoiceDate: Date;

  milestoneId: string | null;
  milestoneName: string | null;
  setIndex: number | null;

  description: string | null;

  quantityBilled: number;

  unitPriceINR: number | null;
  calculatedAmountINR: number | null;
  invoiceAmountINR: number;
  commercialAdjustmentINR: number | null;

  clientReference: string | null;
  remarks: string | null;

  status: string;
  createdBy: string;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * The frontend's "InvoiceItem" shape — never its own stored row. Derived at
 * read time from a QuantityItem plus its InvoiceLine rows, so
 * `InvoiceItem.id === QuantityItem.id` holds by construction. See
 * services/invoice.service.ts's listInvoiceItemsForProject().
 */
export interface InvoiceItemDto {
  id: string;
  description: string;
  qty: number;
  uom: string;
  unitPrice: number;
  totalPrice: number;
  invoices: InvoiceLineDto[];
}

/** GET /projects/:projectId/invoice-items response — one entry per QuantityItem belonging to that project. */
export interface InvoiceItemListDto {
  items: InvoiceItemDto[];
}

/**
 * One row of a bulk Ingest request — the ONLY invoice-line-creation shape
 * that carries its own `id` and its own historical snapshot fields
 * (unitPriceINR/calculatedAmountINR/commercialAdjustmentINR), preserved
 * verbatim rather than recomputed from the QuantityItem's CURRENT rate. Used
 * exclusively by the legacy-migration step, never by the ordinary Raise
 * Invoice UI action. See invoice.service.ts's ingestInvoiceLinesForProject().
 */
export interface IngestInvoiceLineDto {
  id: string;
  quantityItemId: string;

  invoiceNo: string;
  invoiceDate: string;

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

/** POST /projects/:projectId/invoice-items/ingest response — items are in the exact same order as the request's lines[] array. */
export interface IngestInvoiceLinesResultDto {
  items: InvoiceLineDto[];
}
