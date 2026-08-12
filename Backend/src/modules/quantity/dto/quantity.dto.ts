/**
 * Request/response shapes for the Quantity module — same split as
 * project.dto.ts: response DTOs (QuantityDto/QuantityListDto) describe what
 * the API returns; Create/Update DTOs describe what a request body carries.
 * Each QuantityItem belongs to exactly one Project (projectId).
 */
export interface CreateQuantityDto {
  description: string;

  woQty: number;
  invoiceQty: number;
  pendingQty: number;

  uom: string;
  assignedTo?: string | null;

  currency: string;

  unitRate: number;
  exchangeRate: number;
  unitRateINR: number;

  woValue: number;
  pendingAmount: number;
}

/** Same fields as CreateQuantityDto, all optional — a PATCH only carries what changed. */
export interface UpdateQuantityDto {
  description?: string;

  woQty?: number;
  invoiceQty?: number;
  pendingQty?: number;

  uom?: string;
  assignedTo?: string | null;

  currency?: string;

  unitRate?: number;
  exchangeRate?: number;
  unitRateINR?: number;

  woValue?: number;
  pendingAmount?: number;
}

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

  createdAt: Date;
  updatedAt: Date;
}

/** GET /projects/:projectId/quantity response — every Quantity row belonging to that project. */
export interface QuantityListDto {
  items: QuantityDto[];
}
