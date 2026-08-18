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

/** GET /timesheets/imports/:id/rows — optional outcome filter (?status=Failed). */
export const listImportRowsQuerySchema = z.object({
  status: z.enum(["Created", "Updated", "Unchanged", "Removed", "Failed"]).optional(),
});
export type ListImportRowsQuery = z.infer<typeof listImportRowsQuerySchema>;

/** GET /timesheets/entries — find a TimesheetEntry by its identity fields. */
export const findEntriesQuerySchema = z.object({
  employeeNo: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  workDate: z.coerce.date().optional(),
  task: z.string().trim().optional(),
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
