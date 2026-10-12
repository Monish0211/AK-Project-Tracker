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

  /** Invoice Currency feature (Oct 2026) — optional, Phase 1 plumbing only; see invoice.validators.ts. */
  currency?: string;
  exchangeRateToINR?: number;
  invoiceAmountOriginal?: number;

  clientReference?: string | null;
  remarks?: string | null;

  status?: string;
  createdBy: string;
}

/** Same fields as CreateInvoiceLineDto, all optional — a PATCH only carries what changed. quantityItemId is never editable (identity, frozen at creation). currency/exchangeRateToINR/invoiceAmountOriginal are likewise never editable — deliberately absent here. */
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

  /** Invoice Currency feature (Oct 2026) — descriptive only; invoiceAmountINR above stays authoritative for every existing consumer. */
  currency: string;
  exchangeRateToINR: number;
  invoiceAmountOriginal: number | null;

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
 * One raw invoice line, scoped across every project a caller is authorized
 * to see — unlike InvoiceLineDto (always read within one already-known
 * project), this one carries its own projectId so a flat, cross-project
 * list can be grouped back by project on the client. Sept 2026 — Reports/
 * Dashboard Invoice Raised discrepancy fix: GET /invoice-items reuses this
 * shape so Reports can compute Invoice Raised from the same live,
 * authoritative InvoiceLine data the Dashboard KPI already uses, instead of
 * from whatever happens to already be cached in the browser's local
 * Projects mirror (see invoice.service.ts's listAllInvoiceLinesForCaller()).
 */
export interface ReportInvoiceLineDto {
  id: string;
  projectId: string;
  /** The QuantityItem this line bills against — id === InvoiceItemDto.id, so a caller merging this into an already-loaded InvoiceItem list can match by id rather than guessing. */
  quantityItemId: string;
  status: string;
  invoiceAmountINR: number;
  invoiceDate: Date;
  invoiceNo: string;
  quantityBilled: number;
  /** Invoice Currency feature (Oct 2026) — additive; invoiceAmountINR above stays the INR-equivalent figure every total is built from. */
  currency: string;
  exchangeRateToINR: number;
  invoiceAmountOriginal: number | null;
}

/** GET /invoice-items response. */
export interface ReportInvoiceLineListDto {
  items: ReportInvoiceLineDto[];
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
