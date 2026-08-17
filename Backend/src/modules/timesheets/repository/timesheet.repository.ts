import type { Prisma } from "../../../../generated/prisma/client.js";
import { prisma } from "../../../shared/utils/prismaClient.js";

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
  projectId: string;
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
 * ids — used ONCE per import to build the in-memory identity lookup map
 * (see timesheet.service.ts's buildEntryLookupMap()), rather than one query
 * per Excel row. Scoped to `projectId IN (...)` (bounded by the distinct
 * projects actually present in the file — realistically dozens, never
 * thousands) rather than a compound-key IN clause over every
 * (employeeNo, projectId, workDate, task) tuple, which would risk hitting
 * practical parameter-count limits on a large file. Read-only — runs
 * against the plain client, not tx, since it happens before the write
 * transaction begins.
 */
export function findEntriesByProjectIds(projectIds: string[]) {
  if (projectIds.length === 0) return Promise.resolve([]);
  return prisma.timesheetEntry.findMany({ where: { projectId: { in: projectIds } } });
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

export function findEntries(filters: FindEntriesFilters) {
  return prisma.timesheetEntry.findMany({
    where: {
      ...(filters.employeeNo && { employeeNo: filters.employeeNo }),
      ...(filters.projectId && { projectId: filters.projectId }),
      ...(filters.workDate && { workDate: filters.workDate }),
      ...(filters.task !== undefined && { task: filters.task }),
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
