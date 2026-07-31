import * as XLSX from "xlsx";
import type { ProjectResource } from "../types/Project";
import { getEmployees } from "./employeeService";
import { normalizeProjectCode } from "../utils/projectMatching";

// ---------------------------------------------------------------------------
// Header normalization & column matching
// ---------------------------------------------------------------------------

function normalizeHeaderKey(value: unknown): string {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export type FieldKey =
  | "employeeNo"
  | "employeeName"
  | "projectCode"
  | "projectName"
  | "date"
  | "totalHours"
  | "status";

const COLUMN_SYNONYMS: Record<FieldKey, string[]> = {
  employeeNo: ["employee number", "employee no", "employee code", "emp no", "emp code"],
  employeeName: ["employee name", "full name", "name", "employee"],
  projectCode: ["project code", "pr number", "pr no", "project no", "project identifier"],
  projectName: ["project name", "project title", "project"],
  date: ["date", "working date", "entry date"],
  totalHours: ["total hours", "hours", "hours worked", "time spent"],
  status: ["status"],
};

const REQUIRED_FIELDS: { key: FieldKey; label: string }[] = [
  { key: "employeeNo", label: "Employee Number" },
  { key: "employeeName", label: "Employee Name" },
  { key: "projectCode", label: "Project Code" },
  { key: "projectName", label: "Project Name" },
  { key: "date", label: "Date" },
  { key: "totalHours", label: "Total Hours" },
];

// Minimum signature used to identify which worksheet/row holds timesheet data.
const CORE_SIGNATURE_FIELDS: FieldKey[] = ["employeeNo", "employeeName", "projectCode", "date", "totalHours"];

export function normalizeHeaders(headerRow: unknown[]): string[] {
  return headerRow.map((h) => normalizeHeaderKey(h));
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

export function validateHeaders(normalizedHeaders: string[]): {
  indices: Record<FieldKey, number>;
  missing: string[];
} {
  const indices = {} as Record<FieldKey, number>;
  const missing: string[] = [];

  REQUIRED_FIELDS.forEach(({ key, label }) => {
    const idx = findColumnIndex(normalizedHeaders, COLUMN_SYNONYMS[key]);
    if (idx === -1) {
      missing.push(label);
    } else {
      indices[key] = idx;
    }
  });

  indices.status = findColumnIndex(normalizedHeaders, COLUMN_SYNONYMS.status);

  return { indices, missing };
}

// ---------------------------------------------------------------------------
// Workbook / worksheet / header-row detection
// ---------------------------------------------------------------------------

const MAX_HEADER_SCAN_ROWS = 10;

function isRowBlank(row: unknown[]): boolean {
  return !row || row.every((cell) => String(cell ?? "").trim() === "");
}

export function sheetToRows(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
}

export async function parseWorkbook(file: File): Promise<XLSX.WorkBook> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error("Workbook contains no worksheets.");
  }

  return workbook;
}

export function findHeaderRow(
  rows: unknown[][],
  maxScanRows: number = MAX_HEADER_SCAN_ROWS
): { rowIndex: number; row: unknown[] } | null {
  const scanLimit = Math.min(rows.length, maxScanRows);

  for (let i = 0; i < scanLimit; i++) {
    const row = rows[i];
    if (isRowBlank(row)) continue;

    const normalized = normalizeHeaders(row);
    if (hasSignature(normalized, ["employeeNo", "employeeName"])) {
      return { rowIndex: i, row };
    }
  }

  return null;
}

interface WorksheetSelection {
  sheetName: string;
  rows: unknown[][];
  headerRowIndex: number;
  headerRow: unknown[];
}

function selectWorksheet(workbook: XLSX.WorkBook): WorksheetSelection | null {
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = sheetToRows(sheet);
    const headerMatch = findHeaderRow(rows);

    if (!headerMatch) continue;

    const normalized = normalizeHeaders(headerMatch.row);
    if (hasSignature(normalized, CORE_SIGNATURE_FIELDS)) {
      return {
        sheetName,
        rows,
        headerRowIndex: headerMatch.rowIndex,
        headerRow: headerMatch.row,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Import report & error types
// ---------------------------------------------------------------------------

export interface ImportReport {
  workbookName: string;
  detectedSheets: string[];
  selectedSheet: string;
  headerRowNumber: number; // 1-based, for display
  detectedHeaders: string[];
  missingHeaders: string[];
  importedRows: number;
  matchedRows: number;
  ignoredRows: number;
}

export class TimesheetImportError extends Error {
  report: ImportReport;

  constructor(message: string, report: ImportReport) {
    super(message);
    this.name = "TimesheetImportError";
    this.report = report;
  }
}

export interface ImportOutcome {
  resources: ProjectResource[];
  report: ImportReport;
}

// ---------------------------------------------------------------------------
// Debug logging (opt-in via localStorage flag, silent otherwise)
// ---------------------------------------------------------------------------

function isDebugEnabled(): boolean {
  try {
    return window.localStorage.getItem("timesheet_import_debug") === "1";
  } catch {
    return false;
  }
}

function logDebug(label: string, data: unknown): void {
  if (isDebugEnabled()) {
    console.debug(`[TimesheetImport] ${label}`, data);
  }
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

export function calculateWorkingDays(startDateStr: string, endDateStr: string): number {
  if (!startDateStr || !endDateStr) return 0;
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  const diffTime = end.getTime() - start.getTime();
  if (diffTime < 0) return 0;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Excel serial-to-epoch math is UTC-anchored, so the calendar date must be
// read back with UTC getters — reading with local getters would shift the
// date by the host's timezone offset.
function excelSerialToDateKey(serial: number): string | null {
  const utcMs = Math.round((serial - 25569) * 86400 * 1000);
  const date = new Date(utcMs);
  if (isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

// `new Date(dateInstance)` / `new Date(dateString)` construct a date anchored
// to local midnight, so the calendar date must be read back with local
// getters (using UTC getters here would shift the date by the timezone offset).
function localDateToDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function parseExcelDateKey(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return localDateToDateKey(value);
  if (typeof value === "number") return excelSerialToDateKey(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    const num = Number(trimmed);
    if (!isNaN(num) && num > 10000 && num < 100000) return excelSerialToDateKey(num);
    const date = new Date(trimmed);
    return isNaN(date.getTime()) ? null : localDateToDateKey(date);
  }
  return null;
}

export function getCellText(row: unknown[], index: number | undefined): string {
  if (index === undefined || index === -1) return "";
  return String(row[index] ?? "").trim();
}

// ---------------------------------------------------------------------------
// Project matching
// ---------------------------------------------------------------------------

// Re-exported so every existing importer of normalizeProjectCode from this
// file keeps working unchanged — the canonical implementation (PR Number +
// Job Number aware) now lives in utils/projectMatching.ts, shared by every
// module that needs to reconcile a project code, not just timesheet import.
export { normalizeProjectCode };

export function matchProject(row: unknown[], indices: Record<FieldKey, number>, projectPRNo: string): boolean {
  const rowCode = normalizeProjectCode(getCellText(row, indices.projectCode));
  const targetCode = normalizeProjectCode(projectPRNo);
  return !!rowCode && !!targetCode && rowCode === targetCode;
}

// ---------------------------------------------------------------------------
// Hours calculation
// ---------------------------------------------------------------------------

export function calculateHours(rows: unknown[][], indices: Record<FieldKey, number>): number {
  return rows.reduce((sum, row) => sum + (Number(getCellText(row, indices.totalHours)) || 0), 0);
}

// ---------------------------------------------------------------------------
// Employee grouping (one employee number -> one resource row)
// ---------------------------------------------------------------------------

export function groupEmployees(
  matchedRows: unknown[][],
  indices: Record<FieldKey, number>
): Omit<ProjectResource, "id">[] {
  const employeesMaster = getEmployees();

  const rowsByEmployee: Record<string, { empName: string; rows: unknown[][] }> = {};

  matchedRows.forEach((row) => {
    const empNo = getCellText(row, indices.employeeNo);
    const empName = getCellText(row, indices.employeeName);
    if (!empNo || !empName) return;

    if (!rowsByEmployee[empNo]) {
      rowsByEmployee[empNo] = { empName, rows: [] };
    }
    rowsByEmployee[empNo].rows.push(row);
  });

  return Object.entries(rowsByEmployee).map(([empNo, { empName, rows }]) => {
    const empMaster = employeesMaster.find(
      (e) => e.employeeNo.trim().toLowerCase() === empNo.trim().toLowerCase()
    );

    const dateKeys = new Set<string>();
    let latestStatus: ProjectResource["status"] = "Active";

    rows.forEach((row) => {
      const dateKey = parseExcelDateKey(row[indices.date]);
      if (dateKey) {
        dateKeys.add(dateKey);
      }

      const statusText = indices.status !== -1 ? getCellText(row, indices.status) : "Active";
      latestStatus = statusText.toLowerCase() === "released" ? "Released" : "Active";
    });

    // Date keys are "YYYY-MM-DD" strings, so lexical sort is chronological.
    const sortedDates = [...dateKeys].sort();
    const startDate = sortedDates[0] || "";
    const endDate = sortedDates[sortedDates.length - 1] || "";

    return {
      employeeNo: empNo,
      employeeName: empMaster?.employeeName || empName,
      reportingManager: empMaster?.reportingManager || "",
      department: empMaster?.department || "",
      designation: empMaster?.designation || "",
      location: empMaster?.location || "",
      startDate,
      endDate,
      workingDays: dateKeys.size,
      totalHours: calculateHours(rows, indices),
      status: latestStatus,
    };
  });
}

// ---------------------------------------------------------------------------
// Merge strategies
// ---------------------------------------------------------------------------

export function mergeEmployees(existing: ProjectResource[], incoming: Omit<ProjectResource, "id">[]): ProjectResource[] {
  const result = [...existing];

  incoming.forEach((inc) => {
    const existingIndex = result.findIndex(
      (e) => e.employeeNo.trim().toLowerCase() === inc.employeeNo.trim().toLowerCase()
    );

    if (existingIndex !== -1) {
      const ext = result[existingIndex];
      let startDate = ext.startDate;
      let endDate = ext.endDate;

      if (inc.startDate) {
        if (!startDate || new Date(inc.startDate) < new Date(startDate)) {
          startDate = inc.startDate;
        }
      }
      if (inc.endDate) {
        if (!endDate || new Date(inc.endDate) > new Date(endDate)) {
          endDate = inc.endDate;
        }
      }

      result[existingIndex] = {
        ...ext,
        employeeName: inc.employeeName || ext.employeeName,
        reportingManager: inc.reportingManager || ext.reportingManager,
        department: inc.department || ext.department,
        designation: inc.designation || ext.designation,
        location: inc.location || ext.location,
        startDate,
        endDate,
        workingDays: calculateWorkingDays(startDate, endDate),
        totalHours: ext.totalHours + inc.totalHours,
        status: inc.status || ext.status,
      };
    } else {
      result.push({
        id: crypto.randomUUID(),
        ...inc,
      });
    }
  });

  return result;
}

export function replaceEmployees(existing: ProjectResource[], incoming: Omit<ProjectResource, "id">[]): ProjectResource[] {
  const result = [...existing];

  incoming.forEach((inc) => {
    const existingIndex = result.findIndex(
      (e) => e.employeeNo.trim().toLowerCase() === inc.employeeNo.trim().toLowerCase()
    );

    if (existingIndex !== -1) {
      const ext = result[existingIndex];
      result[existingIndex] = {
        id: ext.id,
        ...inc,
      };
    } else {
      result.push({
        id: crypto.randomUUID(),
        ...inc,
      });
    }
  });

  return result;
}

export function skipEmployees(existing: ProjectResource[], incoming: Omit<ProjectResource, "id">[]): ProjectResource[] {
  const result = [...existing];

  incoming.forEach((inc) => {
    const exists = result.some(
      (e) => e.employeeNo.trim().toLowerCase() === inc.employeeNo.trim().toLowerCase()
    );

    if (!exists) {
      result.push({
        id: crypto.randomUUID(),
        ...inc,
      });
    }
  });

  return result;
}

function applyMergeStrategy(
  mode: "merge" | "replace" | "skip",
  existing: ProjectResource[],
  incoming: Omit<ProjectResource, "id">[]
): ProjectResource[] {
  if (mode === "replace") return replaceEmployees(existing, incoming);
  if (mode === "skip") return skipEmployees(existing, incoming);
  return mergeEmployees(existing, incoming);
}

// ---------------------------------------------------------------------------
// Import orchestration
// ---------------------------------------------------------------------------

export async function importTimesheet(
  file: File,
  projectPRNo: string,
  mode: "merge" | "replace" | "skip",
  existingResources: ProjectResource[]
): Promise<ImportOutcome> {
  const workbook = await parseWorkbook(file);
  const detectedSheets = workbook.SheetNames;

  logDebug("Workbook opened", { fileName: file.name, detectedSheets });

  const selection = selectWorksheet(workbook);

  if (!selection) {
    throw new TimesheetImportError(
      "Could not find a worksheet containing timesheet data (Employee Number, Employee Name, Project Code, Date, Total Hours).",
      {
        workbookName: file.name,
        detectedSheets,
        selectedSheet: "",
        headerRowNumber: 0,
        detectedHeaders: [],
        missingHeaders: REQUIRED_FIELDS.map((f) => f.label),
        importedRows: 0,
        matchedRows: 0,
        ignoredRows: 0,
      }
    );
  }

  logDebug("Worksheet selected", { sheetName: selection.sheetName, headerRowIndex: selection.headerRowIndex });

  const normalizedHeaders = normalizeHeaders(selection.headerRow);
  const { indices, missing } = validateHeaders(normalizedHeaders);

  logDebug("Headers normalized", normalizedHeaders);

  if (missing.length > 0) {
    throw new TimesheetImportError(
      `Could not import Timesheet. Missing required column(s): ${missing.join(", ")}`,
      {
        workbookName: file.name,
        detectedSheets,
        selectedSheet: selection.sheetName,
        headerRowNumber: selection.headerRowIndex + 1,
        detectedHeaders: selection.headerRow.map((h) => String(h ?? "")),
        missingHeaders: missing,
        importedRows: 0,
        matchedRows: 0,
        ignoredRows: 0,
      }
    );
  }

  const dataRows = selection.rows
    .slice(selection.headerRowIndex + 1)
    .filter((row) => !isRowBlank(row));

  const matchedRows = dataRows.filter((row) => matchProject(row, indices, projectPRNo));
  const ignoredRows = dataRows.length - matchedRows.length;

  logDebug("Rows parsed", {
    total: dataRows.length,
    matched: matchedRows.length,
    ignored: ignoredRows,
    sample: dataRows.slice(0, 5),
  });

  const grouped = groupEmployees(matchedRows, indices);

  logDebug("Employees grouped", grouped);

  const resources = applyMergeStrategy(mode, existingResources, grouped);

  const report: ImportReport = {
    workbookName: file.name,
    detectedSheets,
    selectedSheet: selection.sheetName,
    headerRowNumber: selection.headerRowIndex + 1,
    detectedHeaders: selection.headerRow.map((h) => String(h ?? "")),
    missingHeaders: [],
    importedRows: dataRows.length,
    matchedRows: matchedRows.length,
    ignoredRows,
  };

  return { resources, report };
}
