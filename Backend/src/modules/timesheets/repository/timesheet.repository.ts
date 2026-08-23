import type { Prisma } from "../../../../generated/prisma/client.js";
import { prisma } from "../../../shared/utils/prismaClient.js";
import { projectOwnershipWhereOr } from "../../../shared/utils/projectAccess.js";

/**
 * All Prisma access for TimesheetEntry lives here — the service layer never
 * imports `prisma` directly (same rule as every other module). No business
 * logic, no reconciliation decisions — those live in timesheet.service.ts;
 * this file only knows how to read/write rows.
 *
 * Every mutation takes an explicit `tx: Prisma.TransactionClient` (same
 * convention as user.repository.ts's createPortalUser/createUserModuleAccess
 * etc.) — the whole per-import row-processing pass runs inside one
 * `prisma.$transaction(async (tx) => ...)` in timesheet.service.ts, so a
 * mid-import crash can never leave a partially-applied set of
 * TimesheetEntry changes with no matching audit row (an FK crash was
 * caught exactly this way during Phase 3.8's own testing — see the
 * service's own comment on why the row-log insert must never reference an
 * id this same pass already deleted).
 */

export interface TimesheetEntryCreateData {
  employeeNo: string;
  /** As received from KEKA, preserved regardless of whether employeeNo resolves in Employee Master. */
  rawEmployeeName: string | null;
  /** null = "Unassigned" — Employee matched, Project did not (per the PR-optional-for-display decision). */
  projectId: string | null;
  rawProjectCode: string;
  /** The KEKA Excel's own Project Name column — independent of the linked Project's projectTitle, if any. */
  rawProjectName: string | null;
  workDate: Date;
  task: string;
  hours: number;
  sourceStatus: string;
  firstImportId: string;
  lastImportId: string;
}

/**
 * Bulk-fetch every current TimesheetEntry row for the given set of Project
 * ids, PLUS every existing "Unassigned" (projectId: null) row regardless of
 * this set — used ONCE per import to build the in-memory identity lookup
 * map (see timesheet.service.ts), rather than one query per Excel row.
 * Including Unassigned rows unconditionally is required for correct
 * cross-import reconciliation: without it, a later day's revision of a
 * previously-created Unassigned row would never be recognized as
 * "existing," and would always look like a brand-new Created row instead
 * of correctly being Updated/Removed. Scoped to `projectId IN (...)`
 * (bounded by the distinct projects actually present in the file —
 * realistically dozens, never thousands) rather than a compound-key IN
 * clause over every (employeeNo, projectId, workDate, task) tuple, which
 * would risk hitting practical parameter-count limits on a large file.
 * Read-only — runs against the plain client, not tx, since it happens
 * before the write transaction begins.
 */
export function findEntriesByProjectIds(projectIds: string[]) {
  return prisma.timesheetEntry.findMany({
    where: {
      OR: [...(projectIds.length > 0 ? [{ projectId: { in: projectIds } }] : []), { projectId: null }],
    },
  });
}

/** Full history for one (employeeNo, projectId) pair — the ONLY input to ProjectResource recomputation (projectResource.service.ts). Never scoped to a date range or a single import. Read-only, runs after the write transaction has already committed. */
export function findEntriesForPair(employeeNo: string, projectId: string) {
  return prisma.timesheetEntry.findMany({ where: { employeeNo, projectId } });
}

export function findEntryById(id: string) {
  return prisma.timesheetEntry.findUnique({ where: { id } });
}

export interface FindEntriesFilters {
  employeeNo?: string | undefined;
  projectId?: string | undefined;
  workDate?: Date | undefined;
  task?: string | undefined;
  startDate?: Date | undefined;
  endDate?: Date | undefined;
  page: number;
  pageSize: number;
}

export interface FindEntriesResult {
  items: Awaited<ReturnType<typeof queryEntries>>;
  total: number;
}

/** The one findMany() shape shared by the count and the page fetch below — kept as its own function purely so TypeScript can infer FindEntriesResult's item type from a single source. */
function queryEntries(where: Prisma.TimesheetEntryWhereInput, skip: number, take: number) {
  return prisma.timesheetEntry.findMany({
    where,
    orderBy: { workDate: "asc" },
    include: { project: { select: { prNo: true, projectTitle: true } } },
    skip,
    take,
  });
}

/**
 * `callerUserId` (undefined for Administrator) scopes results to entries
 * with no project at all (the "Unassigned" import case — not attributable
 * to any project, so there's nothing to restrict) plus entries whose
 * project the caller is authorized for — same project-ownership rule as
 * GET /projects, never a second concept. Unchanged by this Priority #4 fix.
 *
 * Includes the linked Project's prNo/projectTitle directly (a mapped row
 * has projectId but no other Project fields of its own) so the frontend
 * Timesheets page can display the real Project Name without depending on
 * its separate, browser-local Projects mirror already being populated —
 * that mirror is only ever filled by visiting the Projects/Manpower pages,
 * so relying on it here silently showed every mapped row as unresolved on
 * a fresh session that went straight to Timesheets.
 *
 * Priority #4 — bounded by page/pageSize (same skip/take + count() shape as
 * employee.repository.ts's listEmployees). startDate/endDate add an
 * optional workDate RANGE filter, independent of (and never combined with)
 * the pre-existing exact-match `workDate` filter — a caller using the
 * original single-date filter sees byte-identical behavior to before this
 * change. This function's own WHERE/ownership semantics are otherwise
 * unchanged; the only thing genuinely new is that a caller must now either
 * pass page/pageSize or accept the schema's defaults, rather than always
 * receiving every matching row in one response.
 */
export async function findEntries(filters: FindEntriesFilters, callerUserId?: string): Promise<FindEntriesResult> {
  const ownershipOr = projectOwnershipWhereOr(callerUserId);

  let workDateFilter: Prisma.TimesheetEntryWhereInput["workDate"] | undefined;
  if (filters.startDate || filters.endDate) {
    workDateFilter = {
      ...(filters.startDate && { gte: filters.startDate }),
      ...(filters.endDate && { lte: filters.endDate }),
    };
  } else if (filters.workDate) {
    workDateFilter = filters.workDate;
  }

  const where: Prisma.TimesheetEntryWhereInput = {
    ...(filters.employeeNo && { employeeNo: filters.employeeNo }),
    ...(filters.projectId && { projectId: filters.projectId }),
    ...(workDateFilter !== undefined && { workDate: workDateFilter }),
    ...(filters.task !== undefined && { task: filters.task }),
    ...(ownershipOr && { OR: [{ projectId: null }, { project: { OR: ownershipOr } }] }),
  };

  const skip = (filters.page - 1) * filters.pageSize;
  const [items, total] = await Promise.all([
    queryEntries(where, skip, filters.pageSize),
    prisma.timesheetEntry.count({ where }),
  ]);

  return { items, total };
}

export function createEntry(tx: Prisma.TransactionClient, data: TimesheetEntryCreateData) {
  return tx.timesheetEntry.create({ data });
}

/**
 * A revision — hours change, lastImportId moves to the import that made the
 * change. firstImportId is never touched.
 *
 * `projectId` is an optional 5th parameter (Priority #5 fix) so a single
 * statement can also relink a row's project (Unassigned -> Resolved, or a
 * relink to a different resolved project — see
 * timesheetReconciliation.rules.ts's decideEntryOutcome()) in the same
 * write as an hours revision, without needing a second repository function.
 * Omitted (undefined) leaves projectId completely untouched — the exact
 * same single-column write this function has always done. Passing `null`
 * explicitly clears the link back to Unassigned; this is distinct from
 * omitting the argument, via the `!== undefined` check below.
 */
export function updateEntryHours(
  tx: Prisma.TransactionClient,
  id: string,
  hours: number,
  lastImportId: string,
  projectId?: string | null
) {
  return tx.timesheetEntry.update({
    where: { id },
    data: { hours, lastImportId, ...(projectId !== undefined && { projectId }) },
  });
}

/** Backs the "Removed" outcome — a correction to 0 hours deletes the row rather than storing a zero (matches the existing frontend parser's own "0 hours is not a real entry" precedent). */
export function deleteEntry(tx: Prisma.TransactionClient, id: string) {
  return tx.timesheetEntry.delete({ where: { id } });
}

export interface TimesheetEntryUpdateData {
  hours?: number;
  task?: string;
  workDate?: Date;
  sourceStatus?: string;
}

/**
 * Manual, single-row correction outside the KEKA reconciliation engine — a
 * standalone update, not part of any import transaction. Deliberately does
 * NOT touch firstImportId/lastImportId: those track which import created/
 * last changed a row, and a manual edit isn't an import (see
 * timesheet.service.ts's editTimesheetEntry, which is the only caller).
 */
export function updateEntryFields(id: string, data: TimesheetEntryUpdateData) {
  return prisma.timesheetEntry.update({ where: { id }, data });
}

/** Standalone single-row delete for the manual Delete-one-entry API — outside any import transaction (compare deleteEntry(tx, id) above, which only ever runs inside processTimesheetImport()'s transaction). */
export function deleteEntryStandalone(id: string) {
  return prisma.timesheetEntry.delete({ where: { id } });
}

/**
 * Every distinct (employeeNo, projectId) pair currently backed by at least
 * one mapped TimesheetEntry — used only by Delete-All to know which
 * ProjectResource rows are timesheet-derived and must be recomputed to
 * zero afterward. A ProjectResource row for a pair with no TimesheetEntry
 * at all (a purely manual Team-Assigned resource, never touched by any
 * KEKA import) is never in this set and is therefore never recomputed or
 * altered by Delete-All.
 */
export function findDistinctMappedPairs() {
  return prisma.timesheetEntry.findMany({
    where: { projectId: { not: null } },
    select: { employeeNo: true, projectId: true },
    distinct: ["employeeNo", "projectId"],
  });
}

/** Backs Delete-All — every TimesheetEntry row, unconditionally. Projects/Employees/TimesheetImport history are untouched (see timesheet.service.ts's deleteAllTimesheetEntries). */
export function deleteAllEntries() {
  return prisma.timesheetEntry.deleteMany({});
}

/**
 * Every currently-"Unassigned" (projectId: null) row, minimal columns —
 * used only by the Project-creation/PR-Number-edit reconciliation path
 * (timesheet.service.ts's reconcileUnassignedEntriesForProject) to find
 * rows whose rawProjectCode might now match a Project. Matching itself
 * happens in application code via the shared normalizeProjectCode(), not
 * here — this is a plain read, same "no business logic in the repository"
 * rule as every other function above.
 */
export function findUnassignedEntries() {
  return prisma.timesheetEntry.findMany({
    where: { projectId: null },
    select: { id: true, employeeNo: true, rawProjectCode: true },
  });
}

/** Assigns a resolved Project to previously-Unassigned rows — only projectId is written; every other field (employeeNo/rawEmployeeName/rawProjectCode/workDate/task/hours) is left exactly as originally imported. */
export function reassignEntriesToProject(ids: string[], projectId: string) {
  return prisma.timesheetEntry.updateMany({ where: { id: { in: ids } }, data: { projectId } });
}

