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
  /** null = "Unassigned" — Employee matched, Project did not (per the PR-optional-for-display decision). */
  projectId: string | null;
  rawProjectCode: string;
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
}

/**
 * `callerUserId` (undefined for Administrator) scopes results to entries
 * with no project at all (the "Unassigned" import case — not attributable
 * to any project, so there's nothing to restrict) plus entries whose
 * project the caller is authorized for — same project-ownership rule as
 * GET /projects, never a second concept.
 */
export function findEntries(filters: FindEntriesFilters, callerUserId?: string) {
  const ownershipOr = projectOwnershipWhereOr(callerUserId);
  return prisma.timesheetEntry.findMany({
    where: {
      ...(filters.employeeNo && { employeeNo: filters.employeeNo }),
      ...(filters.projectId && { projectId: filters.projectId }),
      ...(filters.workDate && { workDate: filters.workDate }),
      ...(filters.task !== undefined && { task: filters.task }),
      ...(ownershipOr && { OR: [{ projectId: null }, { project: { OR: ownershipOr } }] }),
    },
    orderBy: { workDate: "asc" },
  });
}

export function createEntry(tx: Prisma.TransactionClient, data: TimesheetEntryCreateData) {
  return tx.timesheetEntry.create({ data });
}

/** A revision — hours change, lastImportId moves to the import that made the change. firstImportId is never touched. */
export function updateEntryHours(tx: Prisma.TransactionClient, id: string, hours: number, lastImportId: string) {
  return tx.timesheetEntry.update({ where: { id }, data: { hours, lastImportId } });
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

