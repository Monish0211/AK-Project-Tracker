import * as XLSX from "xlsx";

import type { Employee } from "../types/EmployeeModel";
import { employeeMasterData } from "../data/EmployeeMasterData";

const STORAGE_KEY = "employees";

export function getEmployees(): Employee[] {
  const stored = localStorage.getItem(STORAGE_KEY);

  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Employee[];
      // Normalize legacy data by ensuring new fields exist
      return parsed.map((emp) => ({
        ...emp,
        designation: emp.designation || "Engineer",
        location: emp.location || "Chennai",
        grade: emp.grade || "SG1",
      }));
    } catch {
      // Fallback if parsing fails
    }
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
  added: number;
  updated: number;
  totalImported: number;
  invalid: number;
  blank: number;
}

const REQUIRED_IMPORT_HEADERS = [
  "Employee No",
  "Employee Name",
  "Designation",
  "Department",
  "Location",
  "Reporting Manager",
  "Employee Grade",
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
    return { added: 0, updated: 0, totalImported: 0, invalid: 0, blank: 0 };
  }

  const worksheet = workbook.Sheets[firstSheetName];

  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: "",
  });

  if (rows.length === 0) {
    return { added: 0, updated: 0, totalImported: 0, invalid: 0, blank: 0 };
  }

  const [headerRow, ...dataRows] = rows;

  const headerIndexMap = validateImportHeaders(headerRow);

  const employeeNoIndex = headerIndexMap.get("employee no");
  const employeeNameIndex = headerIndexMap.get("employee name");
  const designationIndex = headerIndexMap.get("designation");
  const departmentIndex = headerIndexMap.get("department");
  const locationIndex = headerIndexMap.get("location");
  const reportingManagerIndex = headerIndexMap.get("reporting manager");
  const gradeIndex = headerIndexMap.get("employee grade");
  const statusIndex = headerIndexMap.get("status");

  let added = 0;
  let updated = 0;
  let invalid = 0;
  let blank = 0;

  const employees = getEmployees();

  dataRows.forEach((row) => {
    if (isRowBlank(row)) {
      blank += 1;
      return;
    }

    const employeeNo = getCellText(row, employeeNoIndex);
    const employeeName = getCellText(row, employeeNameIndex);
    const designation = getCellText(row, designationIndex);
    const department = getCellText(row, departmentIndex);
    const location = getCellText(row, locationIndex);
    const reportingManager = getCellText(row, reportingManagerIndex);
    const grade = getCellText(row, gradeIndex);
    const statusText = statusIndex !== undefined ? getCellText(row, statusIndex) : "Active";

    if (!employeeNo || !employeeName || !department || !designation) {
      invalid += 1;
      return;
    }

    const status = resolveEmployeeStatus(statusText);

    // Look for existing employee by Employee Number
    const existingIndex = employees.findIndex(
      (e) => e.employeeNo.trim().toLowerCase() === employeeNo.trim().toLowerCase()
    );

    if (existingIndex !== -1) {
      // Update existing record
      const existing = employees[existingIndex];
      employees[existingIndex] = {
        ...existing,
        employeeName,
        designation,
        department,
        location,
        reportingManager,
        grade,
        status,
        // Preserve createdAt
      };
      updated += 1;
    } else {
      // Create new record
      employees.push({
        id: crypto.randomUUID(),
        employeeNo,
        employeeName,
        designation,
        department,
        location,
        reportingManager,
        grade,
        status,
        createdAt: new Date().toISOString(),
      });
      added += 1;
    }
  });

  saveEmployees(employees);

  return {
    added,
    updated,
    totalImported: added + updated,
    invalid,
    blank,
  };
}

export function exportEmployeesToExcel(employees: Employee[]): void {
  const rows = employees.map((employee, index) => ({
    "Sl No": index + 1,
    "Employee No": employee.employeeNo,
    "Employee Name": employee.employeeName,
    Designation: employee.designation,
    Department: employee.department,
    Location: employee.location,
    "Reporting Manager": employee.reportingManager,
    "Employee Grade": employee.grade,
    Status: employee.status,
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Employees");

  XLSX.writeFile(workbook, "Employee_Master.xlsx");
}

export function downloadEmployeeTemplate(): void {
  // Status column is optional, but included in the template
  const headers = [...REQUIRED_IMPORT_HEADERS, "Status"];
  const worksheet = XLSX.utils.aoa_to_sheet([headers]);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Template");

  XLSX.writeFile(workbook, "Employee_Master_Template.xlsx");
}
