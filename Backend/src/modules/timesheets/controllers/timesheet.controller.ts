import type { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/asyncHandler.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { requireUser } from "../../../shared/utils/requireUser.js";
import { parseTimesheetWorkbook, validateAttachment } from "../services/excelParser.service.js";
import {
  deleteAllTimesheetEntries,
  deleteTimesheetEntry,
  editTimesheetEntry,
  processTimesheetImport,
} from "../services/timesheet.service.js";
import * as importRepo from "../repository/timesheetImport.repository.js";
import * as rowLogRepo from "../repository/timesheetImportRowLog.repository.js";
import * as timesheetRepo from "../repository/timesheet.repository.js";
import type { EditEntryBody } from "../validators/timesheet.validators.js";
import {
  entryIdParamSchema,
  findEntriesQuerySchema,
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
  });

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

  const items = await rowLogRepo.findRowLogsByImportId(id, parsedQuery.data.status);
  res.status(200).json({ success: true, data: { items } });
});

export const getEntries = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const parsed = findEntriesQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new AppError("Invalid query parameters.", 400);

  const callerUserId = user.roleName === "Administrator" ? undefined : user.sub;
  const items = await timesheetRepo.findEntries(parsed.data, callerUserId);
  res.status(200).json({ success: true, data: { items } });
});

/**
 * The traceability endpoint — "which import changed this employee's hours
 * from 4 to 6" is answered by locating the entry (GET /timesheets/entries)
 * then calling this with its id: every row-log entry for it, each already
 * carrying its own Import (email/attachment/timestamps).
 */
export const getEntryHistory = asyncHandler(async (req: Request, res: Response) => {
  const id = parseEntryIdParam(req);
  const entry = await timesheetRepo.findEntryById(id);
  const history = await rowLogRepo.findHistoryForEntry(id);

  res.status(200).json({ success: true, data: { entry: entry ?? null, history } });
});

/**
 * Manual, single-row correction — req.body is already parsed/typed by the
 * route's validate(editEntryBodySchema) middleware (see timesheet.routes.ts).
 */
export const editEntry = asyncHandler(async (req: Request, res: Response) => {
  const id = parseEntryIdParam(req);
  const updated = await editTimesheetEntry(id, req.body as EditEntryBody);
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
