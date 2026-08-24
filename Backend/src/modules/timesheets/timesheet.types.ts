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
  /** The KEKA Excel's own "Project Name" column — a source value, independent of any Portal Project.projectTitle. "" when the source column is absent or blank. */
  rawProjectName: string;
  workDate: Date;
  task: string;
  /** Raw KEKA "Start Time"/"End Time" columns, as text exactly as read from the cell (e.g. "9:00", "09:00:00"). "" when the source Excel has no such column/value for this row — never used raw for identity matching; see timesheetReconciliation.rules.ts's normalizeTimeOfDay(). */
  startTime: string;
  endTime: string;
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
  /** Rows excelParser.service.ts's parseTimesheetWorkbook() already skipped before this function was ever called — passed through only so ProcessImportResult can report them; never read for any reconciliation decision. Both callers (mailPoll.service.ts, timesheet.controller.ts) parse the same way, so both have this available. */
  invalidRows?: InvalidRowInfo[];
  /**
   * P2-08 — set only by mailPoll.service.ts's retry path: the id of a
   * pre-existing TimesheetImport row (previously "Failed") that the caller
   * has ALREADY atomically claimed (flipped to "Processing" via
   * claimFailedImportForRetry()) before calling this function. When set,
   * processTimesheetImport() reuses this row instead of creating a new one
   * — every other field on TimesheetImportMeta is ignored in that case,
   * since the row's own emailMessageId/attachmentId/etc. were already set
   * correctly at its original creation and must not be overwritten.
   */
  existingImportId?: string | null;
}

/** Mirrors excelParser.service.ts's InvalidRow shape — duplicated here (not imported) so timesheet.types.ts, the module's shared-shapes file, doesn't need to depend on the parser file for one small interface. */
export interface InvalidRowInfo {
  rowNumber: number;
  reason: string;
}

export type RowOutcome = "Created" | "Updated" | "Unchanged" | "Removed" | "Failed";

export interface RowLogEntry {
  entryId: string | null;
  rawEmployeeNo: string;
  rawProjectCode: string;
  workDate: Date;
  task: string;
  /** Same raw KEKA Start/End Time text captured on the TimesheetEntry this log row describes — audit-only, never re-derived. Null when the source row had no such column/value. */
  startTime: string | null;
  endTime: string | null;
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
  /**
   * A strict subset of unchangedCount — rows that matched an ALREADY-
   * EXISTING TimesheetEntry (by the exact same identity every reconciliation
   * decision already uses) with IDENTICAL hours, i.e. a duplicate re-send of
   * a fact already recorded, whether from the same file, an earlier Excel
   * import, or an earlier Keka email. unchangedCount itself is untouched —
   * this is purely an additive breakdown for reporting, not a new business
   * rule (a brand-new row arriving with 0 hours is counted in
   * unchangedCount but NOT here, since there was nothing pre-existing for it
   * to duplicate).
   */
  duplicateCount: number;
  /** Never affects reconciliation — see excelParser.service.ts's InvalidRow. Empty for Keka today since mailPoll.service.ts doesn't yet surface it to anyone, but the data is available either way. */
  invalidRows: InvalidRowInfo[];
}
