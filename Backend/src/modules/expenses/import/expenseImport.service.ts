import { createHash } from "node:crypto";
import { Prisma } from "../../../../generated/prisma/client.js";
import { prisma } from "../../../shared/utils/prismaClient.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { normalizeProjectCode } from "../../../shared/utils/projectCode.util.js";
import type { AccessTokenPayload } from "../../../shared/types/auth.types.js";
import { parseExpenseWorkbook } from "./expenseImportParser.js";
import { mapParticularsToCategory } from "./expenseImport.constants.js";
import {
  findBatchByFileHash,
  findActiveProjectsByNormalizedPrNos,
  findActiveImportedExpenses,
  findActiveManualExpenses,
  createBatch,
  updateBatchStats,
  supersedeAndInsert,
} from "./expenseImport.repository.js";
import type { ImportRunResult, SheetImportResult, ImportableExpenseRow } from "./expenseImport.types.js";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB — generous for a Cost Centre Account export; mirrors Timesheet Excel import's own ceiling.

function computeFileHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Runs the Excel Import pipeline: validate -> hash -> parse -> per-sheet PR
 * match + category map + change detection -> (if commit) persist under one
 * new ExpenseImportBatch. `commit: false` (the preview mode) runs the exact
 * same logic and returns the exact same shape, only skipping the actual
 * database writes — so preview and real import can never drift apart, per
 * the approved design.
 */
export async function runExpenseImport(
  file: { buffer: Buffer; originalname: string; mimetype: string },
  user: AccessTokenPayload,
  commit: boolean,
  /** Project ids the caller has explicitly confirmed proceeding for, despite existing manual expenses (§9 of the approved design) — collected from the preview's confirmation UX. Never assumed; a sheet whose project isn't in this list, but which has existing manual expenses, is downgraded to "awaitingManualConfirmation" and never written. */
  confirmedProjectIds: string[] = []
): Promise<ImportRunResult> {
  if (!file.originalname.toLowerCase().endsWith(".xlsx")) {
    throw new AppError("Only .xlsx files are supported for Other Project Expenses import.", 400);
  }
  if (file.buffer.length === 0) {
    throw new AppError("The uploaded file is empty.", 400);
  }
  if (file.buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new AppError("The uploaded file is too large.", 400);
  }

  const fileHash = computeFileHash(file.buffer);

  // Exact-same-file re-upload (§6 of the approved design) — checked BEFORE
  // any parsing, in both preview and commit mode, so a duplicate is caught
  // at preview time too rather than only rejected on commit.
  const existingBatch = await findBatchByFileHash(fileHash);
  if (existingBatch) {
    return {
      batchId: null,
      status: "RejectedDuplicate",
      rejectedDuplicateOfBatchId: existingBatch.id,
      rejectedDuplicateUploadedAt: existingBatch.uploadedAt.toISOString(),
      totalSheetsFound: 0,
      totalRowsFound: 0,
      totalRowsImported: 0,
      totalRowsSkipped: 0,
      sheets: [],
    };
  }

  const parsed = parseExpenseWorkbook(file.buffer);

  const activeProjects = await findActiveProjectsByNormalizedPrNos();
  const projectByNormalizedCode = new Map<string, { id: string; prNo: string }>();
  for (const project of activeProjects) {
    const key = normalizeProjectCode(project.prNo);
    if (key) projectByNormalizedCode.set(key, project);
  }

  const sheetResults: SheetImportResult[] = [];
  let totalRowsFound = 0;
  let totalRowsImported = 0;
  let totalRowsSkipped = 0;

  for (const sheet of parsed.sheets) {
    totalRowsFound += sheet.rows.length;

    if (!sheet.isValidStructure) {
      // Finding 3 — no recognizable header row, or a required column (Particulars/Debit/Credit) is missing.
      // Distinct from "noImportableRows" (structure fine, zero transaction rows) so the two are never confused.
      sheetResults.push({
        sheetName: sheet.sheetName,
        rawPrIdentifier: sheet.rawPrIdentifier,
        matchedProjectId: null,
        matchedPrNo: null,
        unmatchedReason: `Sheet "${sheet.sheetName}" has no recognizable header row, or is missing a required column (Particulars/Debit/Credit) — nothing could be read from it.`,
        rowsFound: 0,
        rowsImportable: [],
        rowsSkippedCreditOnly: [],
        rowsSkippedNoAmount: [],
        rowsSkippedNonNumericDebit: [],
        rowsPendingCategoryDecision: [],
        computedDebitOnlyTotal: 0,
        existingManualExpenses: [],
        changeStatus: "invalidFormat",
      });
      continue;
    }

    const normalizedSheetKey = normalizeProjectCode(sheet.rawPrIdentifier);
    const matchedProject = normalizedSheetKey ? projectByNormalizedCode.get(normalizedSheetKey) : undefined;

    if (!matchedProject) {
      totalRowsSkipped += sheet.rows.length;
      sheetResults.push({
        sheetName: sheet.sheetName,
        rawPrIdentifier: sheet.rawPrIdentifier,
        matchedProjectId: null,
        matchedPrNo: null,
        unmatchedReason: `No active project found matching "${sheet.rawPrIdentifier}".`,
        rowsFound: sheet.rows.length,
        rowsImportable: [],
        rowsSkippedCreditOnly: [],
        rowsSkippedNoAmount: [],
        rowsSkippedNonNumericDebit: [],
        rowsPendingCategoryDecision: [],
        computedDebitOnlyTotal: 0,
        existingManualExpenses: [],
        changeStatus: "unmatchedPr",
      });
      continue;
    }

    const rowsImportable: ImportableExpenseRow[] = [];
    const rowsSkippedCreditOnly: { particulars: string; creditAmount: number }[] = [];
    const rowsSkippedNoAmount: { particulars: string }[] = [];
    const rowsSkippedNonNumericDebit: { particulars: string; rawDebit: string }[] = [];
    const rowsPendingCategoryDecision: { particulars: string; amount: number }[] = [];

    for (const row of sheet.rows) {
      if (row.outcome === "skippedCreditOnly") {
        rowsSkippedCreditOnly.push({ particulars: row.particulars, creditAmount: row.creditAmount });
        totalRowsSkipped++;
        continue;
      }
      if (row.outcome === "skippedNoAmount") {
        rowsSkippedNoAmount.push({ particulars: row.particulars });
        totalRowsSkipped++;
        continue;
      }
      if (row.outcome === "skippedNonNumericDebit") {
        rowsSkippedNonNumericDebit.push({ particulars: row.particulars, rawDebit: row.rawDebit });
        totalRowsSkipped++;
        continue;
      }

      // row.outcome === "import"
      const mapping = mapParticularsToCategory(row.particulars);
      if (mapping.kind === "pendingDecision") {
        // §3 STOP rule — a known-but-ambiguous Particulars value. Never
        // imported, never bucketed to Miscellaneous Expenses, reported
        // distinctly so it's impossible to mistake for either a mapped row
        // or a genuinely-unknown-fallback row.
        rowsPendingCategoryDecision.push({ particulars: row.particulars, amount: row.amount });
        totalRowsSkipped++;
        continue;
      }

      rowsImportable.push({
        particulars: row.particulars,
        amount: row.amount,
        anomaly: row.anomaly,
        anomalyReason: row.anomaly ? row.anomalyReason : undefined,
        category: mapping.category,
      });
      // Not tallied into totalRowsImported/totalRowsSkipped here — whether
      // these rows actually get written depends on changeStatus, decided
      // below (e.g. "unchangedSkipped"/"awaitingManualConfirmation" mean
      // none of them are written even though they parsed and mapped fine).
    }

    const computedDebitOnlyTotal = rowsImportable.reduce((sum, r) => sum + r.amount, 0);

    const [existingActiveImported, existingManual] = await Promise.all([
      findActiveImportedExpenses(matchedProject.id),
      findActiveManualExpenses(matchedProject.id),
    ]);
    const previousActiveImportedTotal = existingActiveImported.reduce((sum, r) => sum + r.totalCost, 0);
    const hasPriorImport = existingActiveImported.length > 0;

    let changeStatus: SheetImportResult["changeStatus"];
    if (rowsImportable.length === 0) {
      changeStatus = "noImportableRows";
    } else if (!hasPriorImport) {
      changeStatus = "newImport";
    } else if (Math.abs(previousActiveImportedTotal - computedDebitOnlyTotal) < 0.005) {
      // §7 "same PR, same total" — unchanged, skip re-processing this sheet
      // entirely. A cent-level epsilon guards against pure floating-point
      // noise, not against a real difference.
      changeStatus = "unchangedSkipped";
    } else {
      changeStatus = "changedWillSupersede";
    }

    // §9 of the approved design — existing manual expenses on this project
    // require explicit confirmation before either a "newImport" or
    // "changedWillSupersede" write proceeds. Checked AFTER the change-status
    // classification above so the preview can show the user what WOULD
    // happen ("2 rows, ₹X total, will supersede the previous import") side
    // by side with the fact that it's paused pending their confirmation.
    if (
      (changeStatus === "newImport" || changeStatus === "changedWillSupersede") &&
      existingManual.length > 0 &&
      !confirmedProjectIds.includes(matchedProject.id)
    ) {
      changeStatus = "awaitingManualConfirmation";
    }

    // Final tally — only rows that will actually be written (newImport /
    // changedWillSupersede) count as "imported"; everything else parsed
    // fine but isn't persisted this run (unchanged, awaiting confirmation,
    // or the sheet had zero importable rows to begin with).
    if (changeStatus === "newImport" || changeStatus === "changedWillSupersede") {
      totalRowsImported += rowsImportable.length;
    } else {
      totalRowsSkipped += rowsImportable.length;
    }

    sheetResults.push({
      sheetName: sheet.sheetName,
      rawPrIdentifier: sheet.rawPrIdentifier,
      matchedProjectId: matchedProject.id,
      matchedPrNo: matchedProject.prNo,
      rowsFound: sheet.rows.length,
      rowsImportable,
      rowsSkippedCreditOnly,
      rowsSkippedNoAmount,
      rowsSkippedNonNumericDebit,
      rowsPendingCategoryDecision,
      computedDebitOnlyTotal,
      existingManualExpenses: existingManual,
      changeStatus,
      previousActiveImportedTotal: hasPriorImport ? previousActiveImportedTotal : undefined,
    });
  }

  if (!commit) {
    return {
      batchId: null,
      status: sheetResults.some((s) => s.matchedProjectId) ? "Succeeded" : "Failed",
      totalSheetsFound: parsed.sheets.length,
      totalRowsFound,
      totalRowsImported,
      totalRowsSkipped,
      sheets: sheetResults,
    };
  }

  // Nothing in this file actually needs writing (every sheet is
  // unmatched/unchanged/awaiting manual confirmation/has no importable
  // rows) — do NOT create a batch row at all. Registering this file's hash
  // against a batch that wrote nothing would permanently block the
  // legitimate follow-up upload (e.g. the same file re-submitted with
  // confirmedProjectIds once the user confirms) as a false "exact same
  // file already imported" duplicate — caught by this module's own test.
  const sheetsToWrite = sheetResults.filter(
    (s) => s.changeStatus === "newImport" || s.changeStatus === "changedWillSupersede"
  );
  if (sheetsToWrite.length === 0) {
    return {
      batchId: null,
      status: "NothingToImport",
      totalSheetsFound: parsed.sheets.length,
      totalRowsFound,
      totalRowsImported,
      totalRowsSkipped,
      sheets: sheetResults,
    };
  }

  // Commit — one batch row, one $transaction per changed sheet (§15 of the
  // approved design: a failure partway through one sheet's write must never
  // leave both an old and new version simultaneously active, but must not
  // roll back sheets that already committed successfully).
  let batch: Awaited<ReturnType<typeof createBatch>>;
  try {
    batch = await createBatch({
      fileHash,
      fileName: file.originalname,
      uploadedByUserId: user.sub,
      totalSheetsFound: parsed.sheets.length,
    });
  } catch (err) {
    // Finding 4 — two near-simultaneous requests for the same file (e.g. a
    // rapid double-click on "Confirm Import") can both pass the pre-check
    // above and race on the fileHash unique constraint; the constraint
    // itself is what prevents actual data duplication (unchanged), this
    // only makes losing that race look the same as checking first and
    // losing — the existing, already-understood "RejectedDuplicate" shape —
    // instead of a raw, confusing 409 propagating to the client. No
    // meta.target narrowing needed: ExpenseImportBatch has exactly one
    // unique constraint (fileHash), same convention as isUniqueConstraintViolation()
    // in project.service.ts/invoice.service.ts/milestone.service.ts.
    const isFileHashConflict = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
    if (isFileHashConflict) {
      const winner = await findBatchByFileHash(fileHash);
      if (winner) {
        return {
          batchId: null,
          status: "RejectedDuplicate",
          rejectedDuplicateOfBatchId: winner.id,
          rejectedDuplicateUploadedAt: winner.uploadedAt.toISOString(),
          totalSheetsFound: 0,
          totalRowsFound: 0,
          totalRowsImported: 0,
          totalRowsSkipped: 0,
          sheets: [],
        };
      }
    }
    throw err;
  }

  let anySucceeded = false;
  let anyFailed = false;

  for (const sheetResult of sheetsToWrite) {
    if (!sheetResult.matchedProjectId) continue;

    try {
      await prisma.$transaction(async (tx) => {
        await supersedeAndInsert(tx, {
          projectId: sheetResult.matchedProjectId!,
          batchId: batch.id,
          rows: sheetResult.rowsImportable.map((r) => ({
            category: r.category,
            description: r.particulars,
            unitCost: r.amount,
          })),
        });
      });
      anySucceeded = true;
    } catch (err) {
      anyFailed = true;
      // eslint-disable-next-line no-console
      console.error(`Expense import: failed to persist sheet "${sheetResult.sheetName}" for project ${sheetResult.matchedProjectId}`, err);
    }
  }

  const finalStatus = anyFailed ? (anySucceeded ? "PartiallySucceeded" : "Failed") : "Succeeded";
  await updateBatchStats(batch.id, {
    status: finalStatus,
    totalRowsFound,
    totalRowsImported,
    totalRowsSkipped,
  });

  return {
    batchId: batch.id,
    status: finalStatus,
    totalSheetsFound: parsed.sheets.length,
    totalRowsFound,
    totalRowsImported,
    totalRowsSkipped,
    sheets: sheetResults,
  };
}
