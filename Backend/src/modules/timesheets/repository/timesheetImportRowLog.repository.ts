import type { Prisma } from "../../../../generated/prisma/client.js";
import { prisma } from "../../../shared/utils/prismaClient.js";
import type { RowLogEntry } from "../timesheet.types.js";

/** All Prisma access for TimesheetImportRowLog (the append-only, per-row audit trail) lives here. */

/** One bulk insert for the whole import's rows, not one insert per row — runs inside the same transaction as the TimesheetEntry mutations it describes (see timesheet.service.ts), so a row log entry is never committed pointing at a TimesheetEntry id this same pass hasn't actually created/left in place. */
export function createRowLogs(tx: Prisma.TransactionClient, importId: string, rows: RowLogEntry[]) {
  if (rows.length === 0) return Promise.resolve({ count: 0 });
  return tx.timesheetImportRowLog.createMany({
    data: rows.map((row) => ({ importId, ...row })),
  });
}

/**
 * P1-11 — bounded + total-count-aware (was previously a plain, unbounded
 * findMany). A single large Keka import can genuinely have tens of
 * thousands of rows (confirmed by real benchmarking — see P1-03), so
 * returning every row-log entry for one import in a single response was a
 * real, not theoretical, risk. Same skip/take + count() shape already used
 * by findEntries()/listImports() elsewhere in this module.
 *
 * Ordering fix (final-audit finding) — `orderBy: { createdAt: "asc" }`
 * alone is NOT a deterministic sort for this table: createRowLogs() bulk-
 * inserts an entire import's row logs in one createMany() call inside the
 * shared import transaction, and Postgres's now() (the source of
 * @default(now())) is fixed at transaction start, not re-evaluated per row
 * — so every row-log entry from one import shares the exact same
 * createdAt. Proven against real data in this DB: one import's 299 row-log
 * rows all shared one createdAt value, and paginating with createdAt-only
 * ordering returned an overlapping row across page 1 and page 2 (Postgres
 * does not guarantee stable output order for ORDER BY ties across repeated
 * LIMIT/OFFSET queries). `id` is added as a secondary key specifically
 * because it is unique — this makes the sort a total order, so identical
 * pagination requests always partition the result set the same way, with
 * no duplicates and no skipped rows. AuthAuditLog/TimesheetImport do not
 * share this problem (each row there is created individually, in its own
 * transaction, so real timestamps naturally differ) — this fix is scoped
 * to this table only, not applied elsewhere speculatively.
 */
export async function findRowLogsByImportId(
  importId: string,
  outcome: string | undefined,
  page: number,
  pageSize: number
) {
  const where = { importId, ...(outcome && { outcome }) };
  const skip = (page - 1) * pageSize;
  const [items, total] = await Promise.all([
    prisma.timesheetImportRowLog.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip,
      take: pageSize,
    }),
    prisma.timesheetImportRowLog.count({ where }),
  ]);
  return { items, total };
}

/** GET /timesheets/entries/:id/history — every row-log entry for one TimesheetEntry, joined to its own Import (the "which email changed this from 4 to 6" query). */
export function findHistoryForEntry(entryId: string) {
  return prisma.timesheetImportRowLog.findMany({
    where: { entryId },
    orderBy: { createdAt: "asc" },
    include: { import: true },
  });
}
