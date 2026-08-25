import { AppError } from "../../../shared/utils/AppError.js";
import { assertProjectAccessById } from "../../../shared/utils/projectAccess.js";
import { findEmployeeByEmployeeNo } from "../../employees/repository/employee.repository.js";
import type { AccessTokenPayload } from "../../../shared/types/auth.types.js";
import type { ResourceDto, ResourceListDto } from "../dto/resource.dto.js";
import {
  countAllResourcesForAuthorizedProjects,
  createResource as createResourceInRepository,
  countResourcesByEmployeeNo,
  deleteResource as deleteResourceInRepository,
  findResourceByProjectAndEmployee,
  getAllResourcesForAuthorizedProjects,
  getAllResourcesForAuthorizedProjectsPage,
  getResourceById,
  getResourcesByEmployeeNo,
  getResourcesByProjectId,
  RESOURCE_FETCH_CAP,
  updateResource as updateResourceInRepository,
} from "../repository/resource.repository.js";
import type { ProjectResourceData } from "../resource.types.js";
import type { CreateResourceInput, ListResourcesQuery, UpdateResourceInput } from "../validators/resource.validators.js";

function toResourceDto(row: Awaited<ReturnType<typeof getResourceById>>): ResourceDto {
  if (!row) {
    throw new AppError("Project resource not found.", 404);
  }

  return {
    id: row.id,
    projectId: row.projectId,
    employeeNo: row.employeeNo,
    assignmentStartDate: row.assignmentStartDate,
    assignmentEndDate: row.assignmentEndDate,
    assignmentStatus: row.assignmentStatus,
    hourlyRateSnapshot: row.hourlyRateSnapshot,
    workingDays: row.workingDays,
    totalHours: row.totalHours,
    manhourCost: row.manhourCost,
    lastSyncedAt: row.lastSyncedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Throws AppError(404) if the project doesn't exist, or 403 if the caller isn't authorized for it — see shared/utils/projectAccess.ts. */
async function assertProjectExists(projectId: string, user: AccessTokenPayload): Promise<void> {
  await assertProjectAccessById(projectId, user);
}

export async function createResourceForProject(
  projectId: string,
  input: CreateResourceInput,
  user: AccessTokenPayload
): Promise<ResourceDto> {
  await assertProjectExists(projectId, user);

  const existing = await findResourceByProjectAndEmployee(projectId, input.employeeNo);
  if (existing) {
    throw new AppError(`Employee "${input.employeeNo}" is already assigned to this project.`, 409);
  }

  // P2-09 — never trust a client-supplied hourlyRateSnapshot (removed from
  // CreateResourceInput entirely — see resource.validators.ts). Resolved
  // server-side from Employee Master, same best-effort "not found -> 0"
  // fallback as recomputeProjectResource()'s proven P1-04 pattern — a
  // missing Employee row is tolerated here (Resources doesn't require one
  // to exist), it just means no rate can be resolved yet.
  const employee = await findEmployeeByEmployeeNo(input.employeeNo);
  const hourlyRateSnapshot = employee?.manhourExpenses ?? 0;

  const data: ProjectResourceData = {
    employeeNo: input.employeeNo,
    assignmentStartDate: input.assignmentStartDate ?? null,
    assignmentEndDate: input.assignmentEndDate ?? null,
    assignmentStatus: input.assignmentStatus,
    hourlyRateSnapshot,
    workingDays: input.workingDays,
    totalHours: input.totalHours,
    manhourCost: input.totalHours * hourlyRateSnapshot,
    lastSyncedAt: new Date(),
  };

  const created = await createResourceInRepository(projectId, data);
  return toResourceDto(created);
}

export async function listResourcesForProject(projectId: string, user: AccessTokenPayload): Promise<ResourceListDto> {
  await assertProjectExists(projectId, user);

  const rows = await getResourcesByProjectId(projectId);
  return { items: rows.map((row) => toResourceDto(row)) };
}

/**
 * P2-06 — pure boundary check, extracted so the exact off-by-one threshold
 * (`cap` rows is fine, `cap + 1` is not) is unit-testable without seeding
 * RESOURCE_FETCH_CAP+1 real rows into Postgres. Same "CAP+1 fetch, throw if
 * we actually got more than CAP" reasoning as dashboard.service.ts's own
 * project-count overflow check.
 */
export function assertResourceCountWithinCap(rowCount: number, cap: number): void {
  if (rowCount > cap) {
    throw new AppError(
      `Project resources cannot be listed: more than ${cap} authorized resource rows exist. ` +
        "This exceeds the current safe fetch limit — contact support before this figure is trusted.",
      500
    );
  }
}

export async function listAllAuthorizedResources(
  user: AccessTokenPayload,
  query?: ListResourcesQuery
): Promise<ResourceListDto> {
  const callerUserId = user.roleName === "Administrator" ? undefined : user.sub;

  // P2-02 — a real paginated path, taken only when the caller explicitly
  // asks for a page. Every existing caller (today: only
  // fetchAllProjectsFromApi()) that sends neither param falls through to
  // the original full-fetch-with-safety-cap behavior below, unchanged.
  if (query?.page !== undefined || query?.pageSize !== undefined) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 500;
    const [rows, total] = await Promise.all([
      getAllResourcesForAuthorizedProjectsPage(callerUserId, (page - 1) * pageSize, pageSize),
      countAllResourcesForAuthorizedProjects(callerUserId),
    ]);
    return { items: rows.map((row) => toResourceDto(row)), total, page, pageSize };
  }

  const rows = await getAllResourcesForAuthorizedProjects(callerUserId);

  // Fail loudly rather than ever silently truncating: this single
  // unpaginated response feeds fetchAllProjectsFromApi()'s per-project
  // resource-cost attribution (Reports/Analytics), so an incomplete list
  // here would silently understate real cost figures instead of erroring.
  assertResourceCountWithinCap(rows.length, RESOURCE_FETCH_CAP);

  return { items: rows.map((row) => toResourceDto(row)) };
}

/**
 * No employee-existence check here — see resource.validators.ts's module
 * comment: Resources has zero dependency on the Employees module by design.
 *
 * Ownership-scoped the same way as listAllAuthorizedResources: an employee
 * can be assigned across projects owned by different users, so employeeNo
 * alone is never an authorization boundary — each returned row's Project
 * is filtered by projectOwnershipWhereOr() inside the repository query.
 */
export async function listResourcesForEmployee(employeeNo: string, user: AccessTokenPayload): Promise<ResourceListDto> {
  const callerUserId = user.roleName === "Administrator" ? undefined : user.sub;
  const rows = await getResourcesByEmployeeNo(employeeNo, callerUserId);
  return { items: rows.map((row) => toResourceDto(row)) };
}

export async function updateResourceItem(
  id: string,
  input: UpdateResourceInput,
  user: AccessTokenPayload
): Promise<ResourceDto> {
  const existing = await getResourceById(id);
  if (!existing) {
    throw new AppError("Project resource not found.", 404);
  }
  await assertProjectAccessById(existing.projectId, user);

  // P2-09 — hourlyRateSnapshot is never accepted from the client on update
  // either (removed from UpdateResourceInput entirely — see
  // resource.validators.ts). An existing row's rate is frozen forever, per
  // the schema's own rule and recomputeProjectResource()'s proven P1-04
  // pattern (its updateData deliberately omits hourlyRateSnapshot too) —
  // always the persisted value, never re-derived or client-overridable here.
  const hourlyRateSnapshot = existing.hourlyRateSnapshot;
  const totalHours = input.totalHours ?? existing.totalHours;

  const updated = await updateResourceInRepository(id, {
    ...(input.assignmentStartDate !== undefined && { assignmentStartDate: input.assignmentStartDate }),
    ...(input.assignmentEndDate !== undefined && { assignmentEndDate: input.assignmentEndDate }),
    ...(input.assignmentStatus !== undefined && { assignmentStatus: input.assignmentStatus }),
    ...(input.workingDays !== undefined && { workingDays: input.workingDays }),
    totalHours,
    manhourCost: totalHours * hourlyRateSnapshot,
    lastSyncedAt: new Date(),
  });

  return toResourceDto(updated);
}

export async function deleteResourceItem(id: string, user: AccessTokenPayload): Promise<void> {
  const existing = await getResourceById(id);
  if (!existing) {
    throw new AppError("Project resource not found.", 404);
  }
  await assertProjectAccessById(existing.projectId, user);

  await deleteResourceInRepository(id);
}

/**
 * Exported for the Employees module's delete guard only — Employees →
 * Resources, one direction. Resources itself never imports anything from
 * Employees (see resource.validators.ts's module comment), so this stays a
 * clean, acyclic dependency.
 */
export async function countResourcesForEmployee(employeeNo: string): Promise<number> {
  return countResourcesByEmployeeNo(employeeNo);
}
