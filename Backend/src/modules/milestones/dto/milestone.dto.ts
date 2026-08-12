/**
 * Request/response shapes for the Milestones module — same split as
 * quantity.dto.ts: response DTOs (MilestoneDto/MilestoneListDto) describe
 * what the API returns; Create/Update/Ingest DTOs describe what a request
 * body carries. Each PaymentMilestone belongs to exactly one Project.
 */
export interface CreateMilestoneDto {
  milestoneName: string;
  paymentPercentage: number;
  dueDate?: string | null;
}

/** Same fields as CreateMilestoneDto, all optional — a PATCH only carries what changed. */
export interface UpdateMilestoneDto {
  milestoneName?: string;
  paymentPercentage?: number;
  dueDate?: string | null;
}

/**
 * One row of a bulk Ingest request — the ONLY milestone-creation shape that
 * carries its own `id`. Used exclusively by the legacy-migration and future
 * Excel-Import callers, never by the ordinary "Add Payment" UI action. See
 * docs/PMO_PORTAL_TECHNICAL_DOCUMENTATION.md's Payment Milestone ID
 * Stability Strategy.
 */
export interface IngestMilestoneDto {
  id: string;
  milestoneName: string;
  paymentPercentage: number;
  dueDate?: string | null;
}

export interface MilestoneDto {
  id: string;
  projectId: string;
  milestoneName: string;
  paymentPercentage: number;
  dueDate: Date | null;
  /** Always server-derived: workOrderValueINR (sum of QuantityItem.woValue for the project) × paymentPercentage ÷ 100. Never stored, never accepted from the client. */
  amount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** GET /projects/:projectId/milestones response — every milestone belonging to that project. */
export interface MilestoneListDto {
  items: MilestoneDto[];
}

/** POST /projects/:projectId/milestones/ingest response — items are in the exact same order as the request's milestones[] array. */
export interface IngestMilestonesResultDto {
  items: MilestoneDto[];
}
