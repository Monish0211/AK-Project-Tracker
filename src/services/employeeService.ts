import * as XLSX from "xlsx";

import type { Employee } from "../types/EmployeeModel";
import { employeeMasterData } from "../data/EmployeeMasterData";

const STORAGE_KEY = "employees_v3";

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
        remarks: emp.remarks || "",
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

function normalizeHeaderText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " "); // collapse multiple spaces to a single space
}

const FIELD_SYNONYMS = {
  employeeNo: [
    "employee number",
    "employee no",
    "employee code",
    "emp no",
    "emp code",
  ],
  employeeName: [
    "employee name",
    "full name",
    "name",
    "employee",
  ],
  designation: [
    "designation",
    "job title",
    "position",
    "role",
  ],
  department: [
    "department",
    "dept",
  ],
  reportingManager: [
    "reporting manager",
    "reporting to",
    "manager",
    "supervisor",
  ],
  location: [
    "location",
    "work location",
    "office",
  ],
  grade: [
    "grade",
    "employee grade",
    "band",
  ],
  status: [
    "status",
  ],
  remarks: [
    "remarks",
    "remark",
    "comments",
    "comment",
  ],
} as const;

const REQUIRED_FIELDS = [
  { key: "employeeNo", label: "Employee Number", synonyms: FIELD_SYNONYMS.employeeNo },
  { key: "employeeName", label: "Employee Name", synonyms: FIELD_SYNONYMS.employeeName },
  { key: "designation", label: "Designation", synonyms: FIELD_SYNONYMS.designation },
  { key: "department", label: "Department", synonyms: FIELD_SYNONYMS.department },
  { key: "location", label: "Location", synonyms: FIELD_SYNONYMS.location },
  { key: "reportingManager", label: "Reporting Manager", synonyms: FIELD_SYNONYMS.reportingManager },
  { key: "grade", label: "Employee Grade", synonyms: FIELD_SYNONYMS.grade },
] as const;

function findColumnIndex(headerRow: unknown[], synonyms: readonly string[]): number {
  const normalizedHeaders = headerRow.map((h) => normalizeHeaderText(h));

  for (const synonym of synonyms) {
    const normSynonym = normalizeHeaderText(synonym);
    const index = normalizedHeaders.indexOf(normSynonym);

    if (index !== -1) {
      return index;
    }
  }

  return -1;
}

function resolveImportColumnIndices(headerRow: unknown[]): Record<string, number> {
  const indices: Record<string, number> = {};
  const missingLabels: string[] = [];

  for (const field of REQUIRED_FIELDS) {
    const idx = findColumnIndex(headerRow, field.synonyms);

    if (idx === -1) {
      missingLabels.push(field.label);
    } else {
      indices[field.key] = idx;
    }
  }

  if (missingLabels.length > 0) {
    throw new Error(
      `Could not import excel. The following required columns could not be found: ${missingLabels.join(", ")}`
    );
  }

  // Find optional fields
  indices["status"] = findColumnIndex(headerRow, FIELD_SYNONYMS.status);
  indices["remarks"] = findColumnIndex(headerRow, FIELD_SYNONYMS.remarks);

  return indices;
}

function isRowBlank(row: unknown[]): boolean {
  return row.every((cell) => String(cell ?? "").trim() === "");
}

function getCellText(row: unknown[], columnIndex: number | undefined): string {
  if (columnIndex === undefined || columnIndex === -1) {
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

  const indices = resolveImportColumnIndices(headerRow);

  const employeeNoIndex = indices["employeeNo"];
  const employeeNameIndex = indices["employeeName"];
  const designationIndex = indices["designation"];
  const departmentIndex = indices["department"];
  const locationIndex = indices["location"];
  const reportingManagerIndex = indices["reportingManager"];
  const gradeIndex = indices["grade"];
  const statusIndex = indices["status"];
  const remarksIndex = indices["remarks"];

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
    const remarks = remarksIndex !== -1 ? getCellText(row, remarksIndex) : "";
    const statusText = statusIndex !== -1 ? getCellText(row, statusIndex) : "Active";

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
        remarks,
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
        remarks,
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
    "Employee Number": employee.employeeNo,
    "Full Name": employee.employeeName,
    "Job Title": employee.designation,
    Department: employee.department,
    Location: employee.location,
    "Reporting To": employee.reportingManager,
    "Employee Grade": employee.grade,
    Remarks: employee.remarks || "",
    Status: employee.status,
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Employees");

  XLSX.writeFile(workbook, "Employee_Master.xlsx");
}

export function downloadEmployeeTemplate(): void {
  const headers = [
    "Employee Number",
    "Full Name",
    "Job Title",
    "Department",
    "Location",
    "Reporting To",
    "Employee Grade",
    "Remarks",
    "Status",
  ];
  const worksheet = XLSX.utils.aoa_to_sheet([headers]);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Template");

  XLSX.writeFile(workbook, "Employee_Master_Template.xlsx");
}
