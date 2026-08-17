/**
 * Shared shapes reused across the Timesheet module's layers — mirrors
 * resource.types.ts/employee.types.ts's role in their own modules.
 */

/** One row as produced by excelParser.service.ts, before any Employee/Project validation. Raw, unvalidated. */
export interface ParsedTimesheetRow {
  employeeNo: string;
  /** Audit/reference only — never used to enrich a row that fails Employee validation. */
  employeeName: string;
  rawProjectCode: string;
  workDate: Date;
  task: string;
  hours: number;
  sourceStatus: string;
}

export type ImportTrigger = "EmailPoll" | "ManualUpload";

/** What differs between the two callers of processTimesheetImport() — see timesheet.service.ts. */
export interface TimesheetImportMeta {
  triggeredBy: ImportTrigger;
  emailMessageId?: string | null;
  attachmentId?: string | null;
  attachmentFilename?: string | null;
  receivedAt?: Date | null;
  uploadedByUserId?: string | null;
}

export type RowOutcome = "Created" | "Updated" | "Unchanged" | "Removed" | "Failed";

export interface RowLogEntry {
  entryId: string | null;
  rawEmployeeNo: string;
  rawProjectCode: string;
  workDate: Date;
  task: string;
  previousHours: number | null;
  newHours: number | null;
  outcome: RowOutcome;
  failureReason: string | null;
}

export type ImportStatus = "Pending" | "Processing" | "Succeeded" | "PartiallySucceeded" | "Failed";

export interface ProcessImportResult {
  importId: string;
  status: ImportStatus;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  removedCount: number;
  failedCount: number;
  errorSummary: string | null;
}
