import { prisma } from "../../../shared/utils/prismaClient.js";
import type { Prisma } from "../../../../generated/prisma/client.js";

/** All Prisma access for the Excel Import pipeline lives here — service layer never imports `prisma` directly, same convention as expense.repository.ts. */

export function findBatchByFileHash(fileHash: string) {
  return prisma.expenseImportBatch.findUnique({ where: { fileHash } });
}

export function findActiveProjectsByNormalizedPrNos(): Promise<{ id: string; prNo: string }[]> {
  // Every active (non-deleted) project's id/prNo — normalization happens in
  // the service via the existing, already-approved normalizeProjectCode()
  // utility, not here. Small enough to load in full and match in memory
  // (same "load once per import" shape as Timesheet's own
  // buildProjectLookupMap(), rather than one query per sheet).
  return prisma.project.findMany({
    where: { isDeleted: false },
    select: { id: true, prNo: true },
  });
}

/** Active (isActive: true), import-sourced (importBatchId not null) rows currently contributing to this project's total — the "previous imported version" a new batch would supersede. */
export function findActiveImportedExpenses(projectId: string) {
  return prisma.projectExpense.findMany({
    where: { projectId, isActive: true, importBatchId: { not: null } },
  });
}

/** Active, manually-entered (importBatchId: null) rows — surfaced for the §9 existing-manual-expense confirmation UX. Never touched by any import-side write. */
export function findActiveManualExpenses(projectId: string) {
  return prisma.projectExpense.findMany({
    where: { projectId, isActive: true, importBatchId: null },
    select: { id: true, category: true, description: true, totalCost: true },
  });
}

export function createBatch(data: {
  fileHash: string;
  fileName: string;
  uploadedByUserId: string;
  totalSheetsFound: number;
}) {
  return prisma.expenseImportBatch.create({
    data: {
      fileHash: data.fileHash,
      fileName: data.fileName,
      uploadedByUserId: data.uploadedByUserId,
      status: "Processing",
      totalSheetsFound: data.totalSheetsFound,
    },
  });
}

export function updateBatchStats(
  batchId: string,
  data: { status: string; totalRowsFound: number; totalRowsImported: number; totalRowsSkipped: number }
) {
  return prisma.expenseImportBatch.update({ where: { id: batchId }, data });
}

/**
 * Applies one PR sheet's change (§7/§8 of the approved design) atomically:
 * deactivate the project's currently-active imported rows (if any), then
 * insert the new rows tagged to this batch. A project with NO prior active
 * imported rows simply has an empty deactivate step — inserting fresh rows
 * is itself already the correct "new import" behavior. Runs inside the
 * caller's own $transaction (see expenseImport.service.ts) so a failure
 * partway through never leaves both an old and a new version simultaneously
 * contributing to the total.
 */
export async function supersedeAndInsert(
  tx: Prisma.TransactionClient,
  params: {
    projectId: string;
    batchId: string;
    rows: { category: string; description: string; unitCost: number }[];
  }
): Promise<void> {
  await tx.projectExpense.updateMany({
    where: { projectId: params.projectId, isActive: true, importBatchId: { not: null } },
    data: { isActive: false },
  });

  if (params.rows.length === 0) return;

  await tx.projectExpense.createMany({
    data: params.rows.map((row) => ({
      projectId: params.projectId,
      category: row.category,
      description: row.description,
      quantity: 1,
      unitCost: row.unitCost,
      // quantity is always 1, unitCost = the Debit amount, for every imported
      // row. This was flagged as an open item in the design review (the
      // Excel gives one lump amount per row, not a quantity x rate
      // breakdown) and was not explicitly re-confirmed in the "implement"
      // instructions either — proceeding with quantity=1/unitCost=amount
      // because it is the only choice that reproduces the correct
      // totalCost regardless of how quantity/unitCost are split, and is
      // called out again in the final report rather than treated as settled.
      totalCost: row.unitCost,
      importBatchId: params.batchId,
      isActive: true,
    })),
  });
}
