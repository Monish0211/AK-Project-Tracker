import * as XLSX from "xlsx";
import { AppError } from "../../../shared/utils/AppError.js";
import type { ParsedTimesheetRow } from "../timesheet.types.js";

/**
 * Backend port of the frontend's tolerant Excel-parsing approach
 * (frontend/src/services/timesheetImportService.ts's findHeaderRow/
 * validateHeaders/synonym matching, and timesheetService.ts's
 * extractTimesheetEntries()) — reimplemented server-side against the same
 * `xlsx` library the frontend already uses, so a real KEKA file that the
 * frontend's own parser could already handle keeps working here unchanged.
 *
 * NOT assumed identical to the synthetic test fixture
 * (frontend/public/__test_timesheet__.xlsx) — every header synonym, sheet-
 * structure, and column-position assumption below is PROVISIONAL, pending
 * a real KEKA file (Stage 1-4 analysis). Kept deliberately easy to adjust:
 * every assumption lives in the small tables below, not scattered through
 * parsing logic.
 */

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB — generous for a timesheet export; real KEKA file size unverified (Stage 4 §7 open question)
const MAX_HEADER_SCAN_ROWS = 10;

type FieldKey = "employeeNo" | "employeeName" | "projectCode" | "date" | "task" | "totalHours" | "status";

const COLUMN_SYNONYMS: Record<FieldKey, string[]> = {
  employeeNo: ["employee number", "employee no", "employee code", "emp no", "emp code"],
  employeeName: ["employee name", "full name", "name", "employee"],
  projectCode: ["project code", "pr number", "pr no", "project no", "project identifier"],
  date: ["date", "working date", "entry date"],
  task: ["task"],
  totalHours: ["total hours", "hours", "hours worked", "time spent"],
  status: ["status"],
};

const REQUIRED_FIELDS: { key: FieldKey; label: string }[] = [
  { key: "employeeNo", label: "Employee Number" },
  { key: "employeeName", label: "Employee Name" },
  { key: "projectCode", label: "Project Code / PR Number" },
  { key: "date", label: "Date" },
  { key: "totalHours", label: "Total Hours" },
];

const CORE_SIGNATURE_FIELDS: FieldKey[] = ["employeeNo", "employeeName"];

function normalizeHeaderKey(value: unknown): string {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function findColumnIndex(normalizedHeaders: string[], synonyms: string[]): number {
  for (const synonym of synonyms) {
    const idx = normalizedHeaders.indexOf(normalizeHeaderKey(synonym));
    if (idx !== -1) return idx;
  }
  return -1;
}

function hasSignature(normalizedHeaders: string[], fields: FieldKey[]): boolean {
  return fields.every((field) => findColumnIndex(normalizedHeaders, COLUMN_SYNONYMS[field]) !== -1);
}

function isRowBlank(row: unknown[]): boolean {
  return !row || row.every((cell) => String(cell ?? "").trim() === "");
}

function getCellText(row: unknown[], index: number): string {
  if (index === -1 || index === undefined) return "";
  return String(row[index] ?? "").trim();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Excel serial date -> UTC-midnight Date. Serial-to-epoch math is UTC-anchored (matches frontend's excelSerialToDateKey). */
function excelSerialToDate(serial: number): Date | null {
  const utcMs = Math.round((serial - 25569) * 86400 * 1000);
  const date = new Date(utcMs);
  if (isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Always returns UTC-midnight for the calendar day, regardless of input
 * shape — this is the single normalized representation TimesheetEntry.
 * workDate stores, so date-based grouping/matching (dateKey() in
 * timesheet.service.ts / projectResource.service.ts) is never thrown off
 * by a stray time-of-day component.
 */
function parseWorkDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  if (typeof value === "number") return excelSerialToDate(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    const num = Number(trimmed);
    if (!isNaN(num) && num > 10000 && num < 100000) return excelSerialToDate(num);
    const parsed = new Date(trimmed);
    if (isNaN(parsed.getTime())) return null;
    return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
  }
  return null;
}

export interface ParsedWorkbookResult {
  rows: ParsedTimesheetRow[];
  detectedSheets: string[];
  selectedSheet: string;
  headerRowNumber: number;
}

/** Validates size/extension before any parsing is attempted — the trust boundary a human file-picker used to provide (Stage 4 §17). */
export function validateAttachment(filename: string, bytes: Buffer): void {
  if (bytes.length === 0) {
    throw new AppError("Attachment is empty.", 400);
  }
  if (bytes.length > MAX_FILE_SIZE_BYTES) {
    throw new AppError(`Attachment exceeds the ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB size limit.`, 400);
  }
  const lower = filename.toLowerCase();
  if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
    throw new AppError("Attachment must be an Excel file (.xlsx or .xls).", 400);
  }
}

/**
 * Parses a KEKA-style workbook into ParsedTimesheetRow[]. Throws AppError
 * (caller records this as a file-level Failed import — see
 * timesheet.controller.ts) if the file won't open at all, or no sheet
 * contains a recognizable header. Tolerates title/generated-date rows above
 * the real header, and unrelated extra sheets (e.g. a "Notes" sheet) —
 * matching the existing frontend parser's proven behavior exactly.
 */
export function parseTimesheetWorkbook(bytes: Buffer): ParsedWorkbookResult {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, { type: "buffer" });
  } catch {
    throw new AppError("Could not open the Excel file — it may be corrupted or not a valid .xlsx/.xls file.", 400);
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new AppError("Workbook contains no worksheets.", 400);
  }

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const allRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });

    const scanLimit = Math.min(allRows.length, MAX_HEADER_SCAN_ROWS);
    for (let i = 0; i < scanLimit; i++) {
      const headerRow = allRows[i];
      if (!headerRow || isRowBlank(headerRow)) continue;

      const normalized = headerRow.map((h) => normalizeHeaderKey(h));
      if (!hasSignature(normalized, CORE_SIGNATURE_FIELDS)) continue;

      const missing = REQUIRED_FIELDS.filter((f) => findColumnIndex(normalized, COLUMN_SYNONYMS[f.key]) === -1);
      if (missing.length > 0) {
        // This sheet has an Employee-shaped header but is missing other
        // required columns — keep scanning other sheets before giving up.
        continue;
      }

      const indices: Record<FieldKey, number> = {
        employeeNo: findColumnIndex(normalized, COLUMN_SYNONYMS.employeeNo),
        employeeName: findColumnIndex(normalized, COLUMN_SYNONYMS.employeeName),
        projectCode: findColumnIndex(normalized, COLUMN_SYNONYMS.projectCode),
        date: findColumnIndex(normalized, COLUMN_SYNONYMS.date),
        task: findColumnIndex(normalized, COLUMN_SYNONYMS.task),
        totalHours: findColumnIndex(normalized, COLUMN_SYNONYMS.totalHours),
        status: findColumnIndex(normalized, COLUMN_SYNONYMS.status),
      };

      const dataRows = allRows.slice(i + 1).filter((r) => !isRowBlank(r));
      const rows: ParsedTimesheetRow[] = [];

      for (const row of dataRows) {
        const employeeNo = getCellText(row, indices.employeeNo);
        const employeeName = getCellText(row, indices.employeeName);
        const rawProjectCode = getCellText(row, indices.projectCode);
        const workDate = parseWorkDate(row[indices.date]);
        const hours = Number(getCellText(row, indices.totalHours));
        const task = indices.task !== -1 ? getCellText(row, indices.task) : "";
        const statusText = indices.status !== -1 ? getCellText(row, indices.status) : "";

        // Structurally malformed rows (no employee, no project, no parseable
        // date, or a non-numeric hours cell) are skipped here — this is a
        // parsing-level skip, distinct from a reconciliation-level Failed
        // outcome, since there is no employeeNo/date identity to even log
        // against. Matches the existing frontend parser's own precedent of
        // silently ignoring genuinely blank/malformed trailing rows.
        if (!employeeNo || !rawProjectCode || !workDate || isNaN(hours)) continue;

        rows.push({
          employeeNo,
          employeeName,
          rawProjectCode,
          workDate,
          task,
          hours,
          sourceStatus: statusText.toLowerCase() === "released" ? "Released" : "Active",
        });
      }

      return {
        rows,
        detectedSheets: workbook.SheetNames,
        selectedSheet: sheetName,
        headerRowNumber: i + 1,
      };
    }
  }

  throw new AppError(
    "Could not find a worksheet containing timesheet data (Employee Number, Employee Name, Project Code, Date, Total Hours).",
    400
  );
}
