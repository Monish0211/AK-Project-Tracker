/**
 * Request/response shapes for the Project Resource module — same split as
 * quantity.dto.ts: response DTOs (ResourceDto/ResourceListDto) describe what
 * the API returns; Create/Update DTOs describe what a request body carries.
 * Each ProjectResource belongs to exactly one Project (projectId).
 */
export interface CreateResourceDto {
  employeeNo: string;

  assignmentStartDate?: string | null;
  assignmentEndDate?: string | null;
  assignmentStatus?: string;

  hourlyRateSnapshot: number;

  workingDays?: number;
  totalHours?: number;
}

/** Same fields as CreateResourceDto minus employeeNo (never reassigned to a different employee — remove and recreate instead), all optional. */
export interface UpdateResourceDto {
  assignmentStartDate?: string | null;
  assignmentEndDate?: string | null;
  assignmentStatus?: string;

  hourlyRateSnapshot?: number;

  workingDays?: number;
  totalHours?: number;
}

export interface ResourceDto {
  id: string;
  projectId: string;

  employeeNo: string;

  assignmentStartDate: Date | null;
  assignmentEndDate: Date | null;
  assignmentStatus: string;

  hourlyRateSnapshot: number;

  workingDays: number;
  totalHours: number;

  manhourCost: number;

  lastSyncedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * GET /projects/:projectId/resources or /employees/:employeeNo/assignments
 * response. total/page/pageSize are present only when the caller requested
 * a paginated GET /projects/resources page (P2-02) — undefined otherwise,
 * preserving the exact original `{ items }` shape for every existing caller.
 */
export interface ResourceListDto {
  items: ResourceDto[];
  total?: number;
  page?: number;
  pageSize?: number;
}
