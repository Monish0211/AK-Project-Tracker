/**
 * Request/response shapes for the Quantity module — same split as
 * project.dto.ts: response DTOs (QuantityDto/QuantityListDto) describe what
 * the API returns; Create/Update DTOs describe what a request body carries.
 * Each QuantityItem belongs to exactly one Project (projectId).
 */
export interface CreateQuantityDto {
  description: string;

  woQty: number;

  uom: string;
  assignedTo?: string | null;

  currency: string;

  unitRate: number;
  exchangeRate: number;
  unitRateINR: number;

  woValue: number;
}

/** Same fields as CreateQuantityDto, all optional — a PATCH only carries what changed. */
export interface UpdateQuantityDto {
  description?: string;

  woQty?: number;

  uom?: string;
  assignedTo?: string | null;

  currency?: string;

  unitRate?: number;
  exchangeRate?: number;
  unitRateINR?: number;

  woValue?: number;
}

/**
 * invoiceQty / pendingQty / pendingAmount are DERIVED response fields, not
 * persisted columns (see Priority #3 fix) — computed at read time from
 * InvoiceLine.quantityBilled via shared/utils/quantityProgress.ts. The API
 * contract shape is unchanged; only how these three are produced changed.
 */
export interface QuantityDto {
  id: string;
  projectId: string;

  description: string;

  woQty: number;
  invoiceQty: number;
  pendingQty: number;

  uom: string;
  assignedTo: string | null;

  currency: string;

  unitRate: number;
  exchangeRate: number;
  unitRateINR: number;

  woValue: number;
  pendingAmount: number;

  /**
   * Regional-currency price and value (Phase 3): the line converted into the PROJECT's regional currency at exchangeRate
   * (regional currency per one unit of `currency`). null on a row saved before Phase 3. unitRateINR / woValue stay INR-only.
   * pendingAmount is in the project's regional currency (INR for an India or legacy project, exactly as before).
   */
  unitRateRegional: number | null;
  woValueRegional: number | null;

  createdAt: Date;
  updatedAt: Date;
}

/** GET /projects/:projectId/quantity response — every Quantity row belonging to that project. */
export interface QuantityListDto {
  items: QuantityDto[];
}

/** GET /projects/quantity response (Reports data consistency, Oct 2026) — one page of Quantity rows across every project the caller may read; each row carries its projectId. */
export interface QuantityPageDto {
  items: QuantityDto[];
  total: number;
  page: number;
  pageSize: number;
}
