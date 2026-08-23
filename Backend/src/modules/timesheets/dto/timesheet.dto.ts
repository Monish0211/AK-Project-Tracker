/** Response shapes for the Timesheet module's read/audit endpoints. */

export interface TimesheetImportDto {
  id: string;
  emailMessageId: string | null;
  attachmentId: string | null;
  attachmentFilename: string | null;
  receivedAt: Date | null;
  processingStartedAt: Date | null;
  processingFinishedAt: Date | null;
  status: string;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  removedCount: number;
  failedCount: number;
  errorSummary: string | null;
  triggeredBy: string;
  uploadedByUserId: string | null;
  createdAt: Date;
}

export interface TimesheetImportListDto {
  items: TimesheetImportDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TimesheetImportRowLogDto {
  id: string;
  importId: string;
  entryId: string | null;
  rawEmployeeNo: string;
  rawProjectCode: string;
  workDate: Date;
  task: string;
  previousHours: number | null;
  newHours: number | null;
  outcome: string;
  failureReason: string | null;
  createdAt: Date;
}

export interface TimesheetImportRowLogListDto {
  items: TimesheetImportRowLogDto[];
}

export interface TimesheetEntryDto {
  id: string;
  employeeNo: string;
  rawEmployeeName: string | null;
  projectId: string | null;
  /** Present (non-null) only when projectId resolves to a real, non-deleted-select Project — see findEntries()'s include. Association/ownership info only — NEVER the source of the Timesheets "Project Name" column, which is rawProjectName below. */
  project: { prNo: string; projectTitle: string } | null;
  rawProjectCode: string;
  /** The KEKA Excel's own Project Name column — the authoritative source for the Timesheets "Project Name" display column. Independent of project.projectTitle. */
  rawProjectName: string | null;
  workDate: Date;
  task: string;
  hours: number;
  sourceStatus: string;
  firstImportId: string;
  lastImportId: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Priority #4 — bounded, same {items, total, page, pageSize} shape as TimesheetImportListDto/the Employees list response. */
export interface TimesheetEntryListDto {
  items: TimesheetEntryDto[];
  total: number;
  page: number;
  pageSize: number;
}

/** GET /timesheets/entries/:id/history — the row-log history for one entry, each row already carrying its own Import context. */
export interface TimesheetEntryHistoryDto {
  entry: TimesheetEntryDto | null;
  history: (TimesheetImportRowLogDto & { import: TimesheetImportDto })[];
}
