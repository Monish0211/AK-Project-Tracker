/**
 * Request/response shapes for the Invoices module — same split as
 * quantity.dto.ts/milestone.dto.ts: response DTOs describe what the API
 * returns; Create/Update/Ingest DTOs describe what a request body carries.
 */

import type { InvoiceGstSnapshotDto } from "../../invoiceGst/invoiceGst.service.js";

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
  /** Phase 5: 1 invoice currency = X project currency (number or text). The same figure as exchangeRateToINR for an INR / legacy project. */
  exchangeRateToProject?: number | string;
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
  /**
   * Multi-country invoice currency (Phase 5). projectCurrency is null for an INR / legacy project (invoiceAmountINR IS its project amount). For a line on a
   * non-INR project: the project currency, the rate (project currency per 1 invoice currency, as exact text), and the project-currency equivalents that are
   * authoritative for billing. Its INR-named figures above are 0.
   */
  projectCurrency: string | null;
  exchangeRateToProject: string | null;
  invoiceAmountProject: number | null;
  unitPriceProject: number | null;
  calculatedAmountProject: number | null;
  commercialAdjustmentProject: number | null;
  /** Regional counterparts of recordedCashINR / settledINR: the same figures in the PROJECT currency, present only on a non-INR project's line. */
  recordedCashProject?: number;
  settledProject?: number;

  clientReference: string | null;
  remarks: string | null;

  status: string;
  createdBy: string;

  /** Invoice Payment workflow (Nov 2026) — present only when this line's invoice has a recorded payment. Actual bank cash (excl. GST, never a deduction) allocated to this line, in INR. */
  recordedCashINR?: number;
  /** Cash plus the deductions the business counts (TDS) allocated to this line, in INR — what reduces Outstanding. */
  settledINR?: number;
  /** Invoice-level GST snapshot (Nov 2026) - the same object on every line of an invoice that has one; absent for a legacy / Draft invoice. */
  gstSnapshot?: InvoiceGstSnapshotDto;

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
  /** Phase 5: see InvoiceLineDto. Reports sum invoiceAmountProject (not invoiceAmountINR, which is 0) when projectCurrency is set. */
  projectCurrency: string | null;
  exchangeRateToProject: string | null;
  invoiceAmountProject: number | null;
  /** Invoice Payment workflow (Nov 2026) — see InvoiceLineDto. Absent for a line whose invoice has no recorded payment. */
  recordedCashINR?: number;
  settledINR?: number;
  recordedCashProject?: number;
  settledProject?: number;
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
