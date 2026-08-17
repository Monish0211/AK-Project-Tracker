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
  projectId: string | null;
  rawProjectCode: string;
  workDate: Date;
  task: string;
  hours: number;
  sourceStatus: string;
  firstImportId: string;
  lastImportId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TimesheetEntryListDto {
  items: TimesheetEntryDto[];
}

/** GET /timesheets/entries/:id/history — the row-log history for one entry, each row already carrying its own Import context. */
export interface TimesheetEntryHistoryDto {
  entry: TimesheetEntryDto | null;
  history: (TimesheetImportRowLogDto & { import: TimesheetImportDto })[];
}
