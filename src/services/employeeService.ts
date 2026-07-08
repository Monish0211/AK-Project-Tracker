import * as XLSX from "xlsx";

import type { Employee } from "../types/EmployeeModel";
import { employeeMasterData } from "../data/EmployeeMasterData";

const STORAGE_KEY = "employees";

export function getEmployees(): Employee[] {
  const stored = localStorage.getItem(STORAGE_KEY);

  if (stored) {
    return JSON.parse(stored) as Employee[];
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(employeeMasterData));

  return employeeMasterData;
}

export function saveEmployees(employees: Employee[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(employees));
}

export function addEmployee(
  employee: Omit<Employee, "id" | "createdAt">
): boolean {
  const employees = getEmployees();

  const exists = employees.some(
    (e) =>
      e.employeeNo.trim().toLowerCase() ===
      employee.employeeNo.trim().toLowerCase()
  );

  if (exists) {
    return false;
  }

  employees.push({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...employee,
  });

  saveEmployees(employees);

  return true;
}

export function updateEmployee(updatedEmployee: Employee): void {
  const employees = getEmployees().map((employee) =>
    employee.id === updatedEmployee.id ? updatedEmployee : employee
  );

  saveEmployees(employees);
}

export function deleteEmployee(id: string): void {
  const employees = getEmployees().filter(
    (employee) => employee.id !== id
  );

  saveEmployees(employees);
}

export interface ImportResult {
  imported: number;
  duplicates: number;
  invalid: number;
  blank: number;
}

export function bulkAddEmployees(
  employeesToImport: Omit<Employee, "id" | "createdAt">[]
): ImportResult {
  const employees = getEmployees();

  const existingEmployeeNos = new Set(
    employees.map((e) => e.employeeNo.trim().toLowerCase())
  );

  let imported = 0;
  let duplicates = 0;

  employeesToImport.forEach((employee) => {
    const key = employee.employeeNo.trim().toLowerCase();

    if (existingEmployeeNos.has(key)) {
      duplicates += 1;
      return;
    }

    existingEmployeeNos.add(key);

    employees.push({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...employee,
    });

    imported += 1;
  });

  saveEmployees(employees);

  return {
    imported,
    duplicates,
    invalid: 0,
    blank: 0,
  };
}

const REQUIRED_IMPORT_HEADERS = [
  "Employee No",
  "Employee Name",
  "Reporting Manager",
  "Department",
  "Manhour Rate",
  "Status",
] as const;

function normalizeHeaderText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function buildHeaderIndexMap(headerRow: unknown[]): Map<string, number> {
  const headerIndexMap = new Map<string, number>();

  headerRow.forEach((header, index) => {
    headerIndexMap.set(normalizeHeaderText(header), index);
  });

  return headerIndexMap;
}

function validateImportHeaders(headerRow: unknown[]): Map<string, number> {
  const headerIndexMap = buildHeaderIndexMap(headerRow);

  const missingHeaders = REQUIRED_IMPORT_HEADERS.filter(
    (header) => !headerIndexMap.has(header.toLowerCase())
  );

  if (missingHeaders.length > 0) {
    throw new Error(
      `Invalid template. Missing column(s): ${missingHeaders.join(", ")}`
    );
  }

  return headerIndexMap;
}

function isRowBlank(row: unknown[]): boolean {
  return row.every((cell) => String(cell ?? "").trim() === "");
}

function getCellText(row: unknown[], columnIndex: number | undefined): string {
  if (columnIndex === undefined) {
    return "";
  }

  return String(row[columnIndex] ?? "").trim();
}

function parseManhourRate(rawValue: string): number | null {
  if (rawValue === "") {
    return null;
  }

  const parsed = Number(rawValue);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function resolveEmployeeStatus(rawValue: string): Employee["status"] {
  return rawValue.trim().toLowerCase() === "inactive" ? "Inactive" : "Active";
}

export async function importEmployeesFromExcel(
  file: File
): Promise<ImportResult> {
  const buffer = await file.arrayBuffer();

  const workbook = XLSX.read(buffer, { type: "array" });

  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return { imported: 0, duplicates: 0, invalid: 0, blank: 0 };
  }

  const worksheet = workbook.Sheets[firstSheetName];

  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: "",
  });

  if (rows.length === 0) {
    return { imported: 0, duplicates: 0, invalid: 0, blank: 0 };
  }

  const [headerRow, ...dataRows] = rows;

  const headerIndexMap = validateImportHeaders(headerRow);

  const employeeNoIndex = headerIndexMap.get("employee no");
  const employeeNameIndex = headerIndexMap.get("employee name");
  const reportingManagerIndex = headerIndexMap.get("reporting manager");
  const departmentIndex = headerIndexMap.get("department");
  const manhourRateIndex = headerIndexMap.get("manhour rate");
  const statusIndex = headerIndexMap.get("status");

  let blank = 0;
  let invalid = 0;

  const validEmployees: Omit<Employee, "id" | "createdAt">[] = [];

  dataRows.forEach((row) => {
    if (isRowBlank(row)) {
      blank += 1;
      return;
    }

    const employeeNo = getCellText(row, employeeNoIndex);
    const employeeName = getCellText(row, employeeNameIndex);
    const reportingManager = getCellText(row, reportingManagerIndex);
    const department = getCellText(row, departmentIndex);
    const manhourRateText = getCellText(row, manhourRateIndex);
    const statusText = getCellText(row, statusIndex);

    if (!employeeNo || !employeeName || !department) {
      invalid += 1;
      return;
    }

    const manhourRate = parseManhourRate(manhourRateText);

    if (manhourRate === null) {
      invalid += 1;
      return;
    }

    validEmployees.push({
      employeeNo,
      employeeName,
      reportingManager,
      department,
      manhourRate,
      status: resolveEmployeeStatus(statusText),
    });
  });

  const { imported, duplicates } = bulkAddEmployees(validEmployees);

  return {
    imported,
    duplicates,
    invalid,
    blank,
  };
}

export function exportEmployeesToExcel(employees: Employee[]): void {
  const rows = employees.map((employee, index) => ({
    "Sl No": index + 1,
    "Employee No": employee.employeeNo,
    "Employee Name": employee.employeeName,
    "Reporting Manager": employee.reportingManager,
    Department: employee.department,
    "Manhour Rate": employee.manhourRate,
    Status: employee.status,
    "Created Date": new Date(employee.createdAt).toLocaleDateString("en-IN"),
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Employees");

  XLSX.writeFile(workbook, "Employee_Master.xlsx");
}

export function downloadEmployeeTemplate(): void {
  const worksheet = XLSX.utils.aoa_to_sheet([[...REQUIRED_IMPORT_HEADERS]]);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Template");

  XLSX.writeFile(workbook, "Employee_Master_Template.xlsx");
}
