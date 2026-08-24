import { z } from "zod";

/**
 * GET /timesheets/imports query params — parsed directly in the controller
 * (the shared `validate()` middleware only covers req.body), same convention
 * as employee.controller.ts's getEmployees.
 */
export const listImportsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
  status: z.string().trim().optional(),
});
export type ListImportsQuery = z.infer<typeof listImportsQuerySchema>;

export const importIdParamSchema = z.object({
  id: z.string().trim().min(1, "Import ID is required."),
});
export type ImportIdParam = z.infer<typeof importIdParamSchema>;

/**
 * GET /timesheets/imports/:id/rows — optional outcome filter (?status=Failed),
 * paginated (P1-11 — this had no bound at all; a single large Keka import
 * can genuinely have tens of thousands of rows, confirmed by real
 * benchmarking during P1-03, so returning every row-log entry for one
 * import in one response was a real risk, not a theoretical one). No
 * current frontend caller exists yet for this endpoint, so these defaults
 * are chosen to match every other paginated list in this module
 * (listImportsQuerySchema) rather than to preserve any existing behavior.
 */
export const listImportRowsQuerySchema = z.object({
  status: z.enum(["Created", "Updated", "Unchanged", "Removed", "Failed"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(500).default(50),
});
export type ListImportRowsQuery = z.infer<typeof listImportRowsQuerySchema>;

/**
 * GET /timesheets/entries — find TimesheetEntry rows by identity fields
 * and/or a date range, bounded by page/pageSize (same convention as
 * listEmployeesQuerySchema/listImportsQuerySchema — page positive-int
 * default 1, pageSize positive-int capped, default matching imports' own
 * default). startDate/endDate are additive to the existing exact-match
 * `workDate` filter, never a replacement for it — a caller that only needs
 * one exact date keeps using `workDate` exactly as before; startDate/endDate
 * is a new, independent way to ask for a range instead. This is purely a
 * retrieval-boundedness change (Priority #4) — it does not alter what any
 * existing caller's un-paginated, unfiltered request used to mean; it only
 * gives every caller a way to ask for a bounded slice instead of everything
 * in one response.
 */
export const findEntriesQuerySchema = z.object({
  employeeNo: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  workDate: z.coerce.date().optional(),
  task: z.string().trim().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
});
export type FindEntriesQuery = z.infer<typeof findEntriesQuerySchema>;

export const entryIdParamSchema = z.object({
  id: z.string().trim().min(1, "Timesheet Entry ID is required."),
});
export type EntryIdParam = z.infer<typeof entryIdParamSchema>;

/**
 * PATCH /timesheets/entries/:id — a manual, single-row correction outside
 * the KEKA reconciliation engine. Identity fields (employeeNo, projectId,
 * rawProjectCode) are deliberately not editable here — reassigning an
 * entry's employee/project is a re-match, not a correction, and stays out
 * of scope (see timesheet.service.ts's editTimesheetEntry).
 */
export const editEntryBodySchema = z
  .object({
    hours: z.coerce.number().positive("Hours must be greater than zero.").optional(),
    task: z.string().trim().optional(),
    workDate: z.coerce.date().optional(),
    sourceStatus: z.enum(["Active", "Released"]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field must be provided." });
export type EditEntryBody = z.infer<typeof editEntryBodySchema>;

/**
 * DELETE /timesheets/entries/historical — query params for the
 * Administrator-only historical-backfill clear (see timesheet.service.ts's
 * clearHistoricalTimesheetEntries()). startDate/endDate are always
 * explicit, Administrator-supplied inputs — there is no configured or
 * derivable "Keka implementation start date" anywhere in this codebase
 * (confirmed by inspection: env.ts, the poll scheduler, and mailPoll.
 * service.ts carry no such value), so this deliberately never guesses one.
 * endDate is capped at "yesterday," computed fresh against `new Date()` at
 * validation time (never a hardcoded literal) — this is explicitly a
 * HISTORICAL clear, not a general-purpose one, so clearing today's
 * still-arriving Keka data is refused rather than silently allowed.
 */
export const historicalClearQuerySchema = z
  .object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((data) => data.startDate.getTime() <= data.endDate.getTime(), {
    message: "Start date must be on or before the end date.",
    path: ["startDate"],
  })
  .refine(
    (data) => {
      const todayUtcMidnight = new Date();
      todayUtcMidnight.setUTCHours(0, 0, 0, 0);
      return data.endDate.getTime() < todayUtcMidnight.getTime();
    },
    { message: "End date must be on or before yesterday — this operation is for historical data only.", path: ["endDate"] }
  );
export type HistoricalClearQuery = z.infer<typeof historicalClearQuerySchema>;
