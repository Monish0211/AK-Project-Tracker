import type { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/asyncHandler.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { requireUser } from "../../../shared/utils/requireUser.js";
import { assertProjectAccess } from "../../../shared/utils/projectAccess.js";
import { parseTimesheetWorkbook, validateAttachment } from "../services/excelParser.service.js";
import {
  clearHistoricalTimesheetEntries,
  deleteAllTimesheetEntries,
  deleteTimesheetEntry,
  editTimesheetEntry,
  processTimesheetImport,
} from "../services/timesheet.service.js";
import { notifyTimesheetImportOutcome } from "../services/timesheetImportNotification.service.js";
import * as importRepo from "../repository/timesheetImport.repository.js";
import * as rowLogRepo from "../repository/timesheetImportRowLog.repository.js";
import * as timesheetRepo from "../repository/timesheet.repository.js";
import type { EditEntryBody, HistoricalClearQuery } from "../validators/timesheet.validators.js";
import {
  entryIdParamSchema,
  findEntriesQuerySchema,
  historicalClearQuerySchema,
  importIdParamSchema,
  listImportRowsQuerySchema,
  listImportsQuerySchema,
} from "../validators/timesheet.validators.js";

// Path params/query aren't covered by the shared `validate()` middleware
// (body only) — same manual-safeParse convention as every other controller.
function parseImportIdParam(req: Request): string {
  const result = importIdParamSchema.safeParse(req.params);
  if (!result.success) throw new AppError("Import ID is required.", 400);
  return result.data.id;
}

function parseEntryIdParam(req: Request): string {
  const result = entryIdParamSchema.safeParse(req.params);
  if (!result.success) throw new AppError("Timesheet Entry ID is required.", 400);
  return result.data.id;
}

/**
 * Administrator-only manual KEKA file upload — a recovery/backfill path,
 * NOT a manual employee-assignment mechanism. Calls the exact same
 * processTimesheetImport() engine Graph email ingestion will call (see
 * mailIngestion/services/mailPoll.service.ts); the only difference is
 * `triggeredBy: "ManualUpload"` and `uploadedByUserId`, both audit-only
 * metadata.
 */
export const importTimesheet = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    throw new AppError("An Excel file is required (field name: file).", 400);
  }

  validateAttachment(file.originalname, file.buffer);
  const parsed = parseTimesheetWorkbook(file.buffer);

  const result = await processTimesheetImport(parsed.rows, {
    triggeredBy: "ManualUpload",
    attachmentFilename: file.originalname,
    uploadedByUserId: req.user?.sub ?? null,
    invalidRows: parsed.invalidRows,
  });

  // Priority #6 Phase 3B — ONE summary notification for this manual upload,
  // after the import has fully resolved and committed. Fire-and-forget
  // (notify() never throws), so a notification failure can never turn a
  // successful upload into an error response.
  await notifyTimesheetImportOutcome(result, "Manual");

  res.status(201).json({ success: true, data: result, message: "Timesheet import completed." });
});

export const getImports = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listImportsQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new AppError("Invalid query parameters.", 400);
  const { page, pageSize, status } = parsed.data;

  const [items, total] = await importRepo.listImports(status, page, pageSize);
  res.status(200).json({ success: true, data: { items, total, page, pageSize } });
});

export const getImportById = asyncHandler(async (req: Request, res: Response) => {
  const id = parseImportIdParam(req);
  const record = await importRepo.findImportById(id);
  if (!record) throw new AppError("Timesheet import not found.", 404);
  res.status(200).json({ success: true, data: record });
});

export const getImportRows = asyncHandler(async (req: Request, res: Response) => {
  const id = parseImportIdParam(req);
  const parsedQuery = listImportRowsQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) throw new AppError("Invalid query parameters.", 400);

  const record = await importRepo.findImportById(id);
  if (!record) throw new AppError("Timesheet import not found.", 404);

  const { status, page, pageSize } = parsedQuery.data;
  const { items, total } = await rowLogRepo.findRowLogsByImportId(id, status, page, pageSize);
  res.status(200).json({ success: true, data: { items, total, page, pageSize } });
});

export const getEntries = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const parsed = findEntriesQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new AppError("Invalid query parameters.", 400);

  const callerUserId = user.roleName === "Administrator" ? undefined : user.sub;
  const { page, pageSize } = parsed.data;
  const result = await timesheetRepo.findEntries(parsed.data, callerUserId);
  res.status(200).json({ success: true, data: { items: result.items, total: result.total, page, pageSize } });
});

/**
 * The traceability endpoint — "which import changed this employee's hours
 * from 4 to 6" is answered by locating the entry (GET /timesheets/entries)
 * then calling this with its id: every row-log entry for it, each already
 * carrying its own Import (email/attachment/timestamps).
 *
 * P5 — same project-ownership rule as GET /timesheets/entries
 * (findEntries()'s projectOwnershipWhereOr), applied here explicitly since
 * a lookup-by-id has no WHERE clause of its own to inherit it from. An
 * Unassigned entry (projectId: null) stays visible to any Timesheets-access
 * caller, matching findEntries()'s own "always visible" rule for that case.
 * A nonexistent id and an existing-but-unauthorized id both now respond
 * identically in shape (404/403 via AppError, no entry data), closing the
 * previous always-200-with-full-data behavior.
 */
export const getEntryHistory = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = parseEntryIdParam(req);
  const entry = await timesheetRepo.findEntryById(id);
  if (!entry) {
    throw new AppError("Timesheet entry not found.", 404);
  }
  if (entry.projectId) {
    assertProjectAccess(user, entry.project!);
  }

  const history = await rowLogRepo.findHistoryForEntry(id);

  res.status(200).json({ success: true, data: { entry, history } });
});

/**
 * Manual, single-row correction — req.body is already parsed/typed by the
 * route's validate(editEntryBodySchema) middleware (see timesheet.routes.ts).
 */
export const editEntry = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = parseEntryIdParam(req);
  const updated = await editTimesheetEntry(id, req.body as EditEntryBody, user);
  res.status(200).json({ success: true, data: updated, message: "Timesheet entry updated." });
});

export const deleteEntry = asyncHandler(async (req: Request, res: Response) => {
  const id = parseEntryIdParam(req);
  await deleteTimesheetEntry(id);
  res.status(200).json({ success: true, message: "Timesheet entry deleted." });
});

/** Administrator-only, irreversible — see timesheet.routes.ts's authorize("Administrator") gate. */
export const deleteAllEntries = asyncHandler(async (_req: Request, res: Response) => {
  const result = await deleteAllTimesheetEntries();
  res.status(200).json({
    success: true,
    data: result,
    message: `Deleted ${result.deletedCount} timesheet entr${result.deletedCount === 1 ? "y" : "ies"}.`,
  });
});

/**
 * Administrator-only, irreversible, date-scoped — see timesheet.routes.ts's
 * authorize("Administrator") gate and timesheet.service.ts's
 * clearHistoricalTimesheetEntries() for the exact deletion scope. Query
 * params only (no body — matches this module's existing GET-with-query
 * convention); the shared validate() middleware only covers req.body.
 */
export const clearHistoricalEntries = asyncHandler(async (req: Request, res: Response) => {
  const parsed = historicalClearQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new AppError(firstIssue?.message ?? "Invalid start/end date.", 400);
  }
  const { startDate, endDate } = parsed.data as HistoricalClearQuery;

  const result = await clearHistoricalTimesheetEntries(startDate, endDate);
  res.status(200).json({
    success: true,
    data: result,
    message: `Deleted ${result.deletedCount} timesheet entr${result.deletedCount === 1 ? "y" : "ies"} between ${result.startDate.toISOString().slice(0, 10)} and ${result.endDate.toISOString().slice(0, 10)}.`,
  });
});
