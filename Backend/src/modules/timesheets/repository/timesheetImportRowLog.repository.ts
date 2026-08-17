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

export function findRowLogsByImportId(importId: string, outcome?: string) {
  return prisma.timesheetImportRowLog.findMany({
    where: { importId, ...(outcome && { outcome }) },
    orderBy: { createdAt: "asc" },
  });
}

/** GET /timesheets/entries/:id/history — every row-log entry for one TimesheetEntry, joined to its own Import (the "which email changed this from 4 to 6" query). */
export function findHistoryForEntry(entryId: string) {
  return prisma.timesheetImportRowLog.findMany({
    where: { entryId },
    orderBy: { createdAt: "asc" },
    include: { import: true },
  });
}
