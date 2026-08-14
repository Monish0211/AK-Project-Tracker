import * as XLSX from "xlsx";

import type { Employee } from "../types/EmployeeModel";
import { apiClient, ApiError } from "./apiClient";

const STORAGE_KEY = "employees_v6";

/**
 * Phase 3.7.1: reads the local Employee Master mirror only — never
 * manufactures demo data. PostgreSQL (via loadEmployeesForApp() /
 * fetchEmployeesFromApi() below) is the only source of truth; this
 * function is purely a synchronous write-through cache that other modules
 * (Dashboard, Reports, Timesheets, Project Leadership, Quantity, etc.)
 * already read. A missing/empty key returns [] — a genuinely empty
 * result, never a seeded one. EmployeeMasterData.ts (the old 120-row demo
 * dataset) is intentionally not imported here anymore — see the Phase
 * 3.7.1 documentation entry for why it was silently populating both
 * localStorage and the UI even when PostgreSQL had zero real rows.
 */
export function getEmployees(): Employee[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored) as Employee[];
    // Normalize legacy data by ensuring new fields exist
    return parsed.map((emp) => ({
      ...emp,
      designation: emp.designation || "Engineer",
      location: emp.location || "Chennai",
      grade: emp.grade || "SG1",
      manhourExpenses: typeof emp.manhourExpenses === "number" ? emp.manhourExpenses : 0,
    }));
  } catch {
    return [];
  }
}

export function saveEmployees(employees: Employee[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(employees));
  window.dispatchEvent(new Event("pmo:data-changed"));
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
    "employee no.",
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
  manhourExpenses: [
    "man-hour expenses",
    "manhour expenses",
    "employee hourly cost",
    "hourly cost",
    "hourly rate",
    "rate",
  ],
  status: [
    "status",
  ],
} as const;

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
  const missingRequiredLabels: string[] = [];

  const requiredFields = [
    { key: "employeeNo", label: "Employee Number", synonyms: FIELD_SYNONYMS.employeeNo },
    { key: "employeeName", label: "Employee Name", synonyms: FIELD_SYNONYMS.employeeName },
  ];

  const optionalFields = [
    { key: "designation", label: "Designation", synonyms: FIELD_SYNONYMS.designation },
    { key: "department", label: "Department", synonyms: FIELD_SYNONYMS.department },
    { key: "location", label: "Location", synonyms: FIELD_SYNONYMS.location },
    { key: "reportingManager", label: "Reporting Manager", synonyms: FIELD_SYNONYMS.reportingManager },
    { key: "grade", label: "Employee Grade", synonyms: FIELD_SYNONYMS.grade },
    { key: "manhourExpenses", label: "Man-hour Expenses", synonyms: FIELD_SYNONYMS.manhourExpenses },
    { key: "status", label: "Status", synonyms: FIELD_SYNONYMS.status },
  ];

  for (const field of requiredFields) {
    const idx = findColumnIndex(headerRow, field.synonyms);
    if (idx === -1) {
      missingRequiredLabels.push(field.label);
    } else {
      indices[field.key] = idx;
    }
  }

  if (missingRequiredLabels.length > 0) {
    throw new Error(
      `Could not import excel. The following required columns could not be found: ${missingRequiredLabels.join(", ")}`
    );
  }

  for (const field of optionalFields) {
    indices[field.key] = findColumnIndex(headerRow, field.synonyms);
  }

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
  const manhourExpensesIndex = indices["manhourExpenses"];
  const statusIndex = indices["status"];

  let invalid = 0;
  let blank = 0;

  // Parsing/column-matching is unchanged from before this phase — only the
  // persistence step below changed: parsed rows now go to the real backend
  // (POST /employees/import) instead of being merged into the local array
  // directly, the same way Phase 3.2 moved Project's own Excel import onto
  // the backend without touching its parsing logic.
  const parsedRows: {
    employeeNo: string;
    employeeName: string;
    designation: string;
    department: string;
    location: string;
    reportingManager: string;
    grade: string;
    manhourExpenses: number;
    status: Employee["status"];
  }[] = [];

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
    const rawManhourExpenses = getCellText(row, manhourExpensesIndex);
    const statusText = statusIndex !== -1 ? getCellText(row, statusIndex) : "Active";

    if (!employeeNo || !employeeName) {
      invalid += 1;
      return;
    }

    const manhourExpenses = Number(rawManhourExpenses.replace(/[^0-9.]/g, "")) || 0;
    const status = resolveEmployeeStatus(statusText);

    parsedRows.push({
      employeeNo,
      employeeName,
      designation,
      department,
      location,
      reportingManager,
      grade,
      manhourExpenses,
      status,
    });
  });

  if (parsedRows.length === 0) {
    return { added: 0, updated: 0, totalImported: 0, invalid, blank };
  }

  const result = await apiClient.post<{ added: number; updated: number; totalImported: number; invalid: number }>(
    "/employees/import",
    { employees: parsedRows }
  );

  await fetchEmployeesFromApi({ pageSize: 200 });

  return {
    added: result.added,
    updated: result.updated,
    totalImported: result.totalImported,
    invalid: invalid + result.invalid,
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
    "Man-hour Expenses": employee.manhourExpenses,
    Status: employee.status,
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Employees");

  XLSX.writeFile(workbook, "Employee_Master.xlsx");
}

// =============================================================================
// PHASE 3.7 — BACKEND-CONNECTED EMPLOYEE MASTER
// =============================================================================
// Everything below is new, additive, and calls the real backend
// (Backend/src/modules/employees) — PostgreSQL is now authoritative for
// Employee Master. The localStorage array above stays a write-through
// MIRROR only, same "hybrid persistence" design as Projects (Phase 3.1):
// every other module that reads via getEmployees() keeps working
// unchanged, since these functions all end by writing whatever the backend
// returned into that same localStorage array via saveEmployees() (which
// already dispatches "pmo:data-changed").

/** Raw shape one row of GET/POST/PATCH /employees returns — see Backend's EmployeeDto. */
interface BackendEmployeeDto {
  id: string;
  employeeNo: string;
  employeeName: string;
  department: string;
  designation: string;
  reportingManager: string | null;
  grade: string;
  location: string;
  manhourExpenses: number;
  status: string;
  dateOfJoining: string | null;
  employeeType: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BackendPaginatedEmployeeList {
  items: BackendEmployeeDto[];
  total: number;
  page: number;
  pageSize: number;
}

/** What the backend's Create/Update Employee endpoints accept. */
interface EmployeePayload {
  employeeNo: string;
  employeeName: string;
  department: string;
  designation: string;
  reportingManager: string | null;
  grade: string;
  location: string;
  manhourExpenses: number;
  status: string;
  dateOfJoining: string | null;
  employeeType: string | null;
}

function toEmployeePayload(employee: Employee): EmployeePayload {
  return {
    employeeNo: employee.employeeNo,
    employeeName: employee.employeeName,
    department: employee.department,
    designation: employee.designation,
    reportingManager: employee.reportingManager?.trim() ? employee.reportingManager : null,
    grade: employee.grade,
    location: employee.location,
    manhourExpenses: employee.manhourExpenses,
    status: employee.status,
    dateOfJoining: employee.dateOfJoining?.trim() ? employee.dateOfJoining : null,
    employeeType: employee.employeeType?.trim() ? employee.employeeType : null,
  };
}

/** Full ISO datetime -> the "YYYY-MM-DD" a <input type="date"> requires — same conversion projectService.ts's toDateOnly() does. */
function toDateOnly(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

function toEmployee(dto: BackendEmployeeDto): Employee {
  return {
    id: dto.id,
    employeeNo: dto.employeeNo,
    employeeName: dto.employeeName,
    department: dto.department,
    designation: dto.designation,
    reportingManager: dto.reportingManager ?? "",
    grade: dto.grade,
    location: dto.location,
    manhourExpenses: dto.manhourExpenses,
    status: dto.status as Employee["status"],
    dateOfJoining: toDateOnly(dto.dateOfJoining) || undefined,
    employeeType: dto.employeeType || undefined,
    createdAt: dto.createdAt,
  };
}

/** Upserts by id into the same localStorage array getEmployees() reads, via the existing saveEmployees() — mirrors projectService.ts's writeThroughProjectsMirror(). */
function writeThroughEmployeesMirror(employees: Employee[]): void {
  const current = getEmployees();
  const byId = new Map(current.map((e) => [e.id, e]));
  employees.forEach((e) => byId.set(e.id, e));
  saveEmployees(Array.from(byId.values()));
}

export interface EmployeeListParams {
  search?: string;
  page?: number;
  pageSize?: number;
  sortField?: string;
  sortDirection?: "asc" | "desc";
  department?: string;
  status?: string;
  grade?: string;
  location?: string;
}

export interface EmployeeListResult {
  items: Employee[];
  total: number;
  page: number;
  pageSize: number;
}

/** The real, paginated/searchable/sortable/filterable Employee List — GET /employees. */
export async function fetchEmployeesFromApi(params: EmployeeListParams = {}): Promise<EmployeeListResult> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 200));
  if (params.sortField) query.set("sortField", params.sortField);
  if (params.sortDirection) query.set("sortDirection", params.sortDirection);
  if (params.department) query.set("department", params.department);
  if (params.status) query.set("status", params.status);
  if (params.grade) query.set("grade", params.grade);
  if (params.location) query.set("location", params.location);

  const result = await apiClient.get<BackendPaginatedEmployeeList>(`/employees?${query.toString()}`);
  const items = result.items.map(toEmployee);
  writeThroughEmployeesMirror(items);

  return { items, total: result.total, page: result.page, pageSize: result.pageSize };
}

/** Creates an employee via the real backend — POST /employees. */
export async function createEmployeeViaApi(employee: Employee): Promise<Employee> {
  const dto = await apiClient.post<BackendEmployeeDto>("/employees", toEmployeePayload(employee));
  const created = toEmployee(dto);
  writeThroughEmployeesMirror([created]);
  return created;
}

/** Updates an employee via the real backend — PATCH /employees/:id. */
export async function updateEmployeeViaApi(id: string, employee: Employee): Promise<Employee> {
  const dto = await apiClient.patch<BackendEmployeeDto>(`/employees/${id}`, toEmployeePayload(employee));
  const updated = toEmployee(dto);
  writeThroughEmployeesMirror([updated]);
  return updated;
}

/**
 * Deletes via the real backend — DELETE /employees/:id. This is a genuine
 * hard delete (Employee has no soft-delete concept, matching this module's
 * pre-existing localStorage behavior and its own "cannot be undone"
 * confirmation copy) — but the backend blocks it with a 409 if this
 * employee has any ProjectResource assignment history; the caller is
 * expected to catch ApiError and display err.message directly (same
 * convention as every other backend-error path in this app).
 */
export async function deleteEmployeeViaApi(id: string): Promise<void> {
  await apiClient.delete(`/employees/${id}`);
  saveEmployees(getEmployees().filter((e) => e.id !== id));
}

// =============================================================================
// PHASE 3.7.1 — MIGRATION CLEANUP (one-time, tracked, never silent)
// =============================================================================
// Replaces the old "attempt, catch{}, fall back to localStorage" migration
// with one that runs at most once per browser profile, validates before
// attempting a network call, reports every skip/failure with a reason, and
// never re-runs once it has resolved — successful or not. See the Phase
// 3.7.1 documentation entry for the bug this replaces (all 120 legacy demo
// rows silently "migrating" by falling back to being re-displayed locally
// while PostgreSQL stayed empty).

const MIGRATION_FLAG_KEY = "employees_migration_completed_v1";

function isMigrationCompleted(): boolean {
  return localStorage.getItem(MIGRATION_FLAG_KEY) === "true";
}

function markMigrationCompleted(): void {
  localStorage.setItem(MIGRATION_FLAG_KEY, "true");
}

/** Raw read of the legacy key, bypassing getEmployees()'s field-normalization — migration needs to see exactly what a pre-Phase-3.7 install actually saved, blank fields included. */
function readLegacyEmployeesRaw(): Employee[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? (parsed as Employee[]) : [];
  } catch {
    return [];
  }
}

/** Mirrors createEmployeeSchema's required fields — checked client-side so a row that can never succeed is reported as "skipped" (a data problem to fix at the source) without burning a network round-trip. */
function validateLegacyEmployeeRow(employee: Employee): string | null {
  if (!employee.employeeNo?.trim()) return "Missing Employee Number.";
  if (!employee.employeeName?.trim()) return "Missing Employee Name.";
  if (!employee.department?.trim()) return "Missing Department.";
  if (!employee.designation?.trim()) return "Missing Designation.";
  if (!employee.grade?.trim()) return "Missing Employee Grade.";
  if (!employee.location?.trim()) return "Missing Location.";
  return null;
}

export interface EmployeeMigrationFailure {
  employeeNo: string;
  employeeName: string;
  reason: string;
}

export interface EmployeeMigrationResult {
  total: number;
  migrated: number;
  skipped: number;
  failed: number;
  failures: EmployeeMigrationFailure[];
}

/**
 * Runs exactly once per browser profile — guarded by MIGRATION_FLAG_KEY,
 * which loadEmployeesForApp() below checks/sets. Never re-attempted after
 * this resolves, whether every row succeeded or not: retrying rows that
 * fail the exact same way forever helps no one — the returned `failures`
 * list is what tells the user what to go fix (via Add/Edit or a corrected
 * Excel Import), not an automatic retry loop.
 */
async function migrateLegacyEmployees(legacyItems: Employee[]): Promise<EmployeeMigrationResult> {
  const result: EmployeeMigrationResult = {
    total: legacyItems.length,
    migrated: 0,
    skipped: 0,
    failed: 0,
    failures: [],
  };

  console.info(`[Employee Migration] Started — ${legacyItems.length} legacy record(s) found in localStorage.`);

  const migratedEmployees: Employee[] = [];

  for (const employee of legacyItems) {
    const validationError = validateLegacyEmployeeRow(employee);
    if (validationError) {
      result.skipped += 1;
      result.failures.push({
        employeeNo: employee.employeeNo || "(blank)",
        employeeName: employee.employeeName || "(blank)",
        reason: validationError,
      });
      console.warn(`[Employee Migration] Skipped "${employee.employeeNo || "(blank)"}" — ${validationError}`);
      continue;
    }

    try {
      const created = await apiClient.post<BackendEmployeeDto>("/employees", toEmployeePayload(employee));
      migratedEmployees.push(toEmployee(created));
      result.migrated += 1;
      console.info(`[Employee Migration] Migrated "${employee.employeeNo}" — ${employee.employeeName}`);
    } catch (err) {
      result.failed += 1;
      const reason = err instanceof ApiError ? err.message : "Unknown error while migrating this record.";
      result.failures.push({ employeeNo: employee.employeeNo, employeeName: employee.employeeName, reason });
      console.error(`[Employee Migration] Failed "${employee.employeeNo}" — ${reason}`);
    }
  }

  // Clear the legacy array BEFORE mirroring the migrated set, so rows that
  // were skipped/failed don't leak back into the write-through mirror —
  // only what genuinely reached PostgreSQL is allowed to populate it from
  // this point on.
  localStorage.removeItem(STORAGE_KEY);
  writeThroughEmployeesMirror(migratedEmployees);
  markMigrationCompleted();

  console.info(
    `[Employee Migration] Completed — ${result.migrated} migrated, ${result.skipped} skipped, ${result.failed} failed of ${result.total} total.`
  );

  return result;
}

export interface LoadEmployeesResult {
  employees: Employee[];
  /** Non-null only on the one call where a migration attempt actually ran. */
  migration: EmployeeMigrationResult | null;
}

/**
 * Guards against two overlapping loadEmployeesForApp() calls both starting
 * a migration attempt before either has finished — concretely, React's
 * StrictMode double-invoking Manpower's mount effect in development, which
 * without this produced two concurrent migration passes: the second one's
 * per-row POSTs hit the rows the first one had *just* created and reported
 * them as failed ("already exists"), corrupting the reported result even
 * though the migration itself succeeded. A second caller while one is
 * already running gets the same in-flight promise instead of starting its
 * own attempt.
 */
let inFlightLoad: Promise<LoadEmployeesResult> | null = null;

export function loadEmployeesForApp(): Promise<LoadEmployeesResult> {
  if (inFlightLoad) {
    return inFlightLoad;
  }

  inFlightLoad = loadEmployeesForAppOnce().finally(() => {
    inFlightLoad = null;
  });

  return inFlightLoad;
}

/**
 * Opening Manpower: PostgreSQL is the only source of truth. If it already
 * has rows, they're returned as-is and no migration logic runs at all. If
 * it's empty and migration hasn't been attempted yet, any legacy
 * localStorage-only employees are migrated exactly once (validated,
 * tracked, logged — see migrateLegacyEmployees()); the legacy key is
 * cleared and the attempt is flagged complete regardless of outcome, so it
 * never runs again. A genuinely empty portal (no backend rows, no legacy
 * data, or migration already attempted) resolves to an empty list — a
 * real empty state, never demo data.
 */
async function loadEmployeesForAppOnce(): Promise<LoadEmployeesResult> {
  const backendResult = await fetchEmployeesFromApi({ pageSize: 200 });

  if (backendResult.items.length > 0) {
    if (!isMigrationCompleted()) markMigrationCompleted();
    return { employees: backendResult.items, migration: null };
  }

  if (isMigrationCompleted()) {
    return { employees: [], migration: null };
  }

  const legacyItems = readLegacyEmployeesRaw();
  if (legacyItems.length === 0) {
    markMigrationCompleted();
    return { employees: [], migration: null };
  }

  const migration = await migrateLegacyEmployees(legacyItems);
  const finalList = await fetchEmployeesFromApi({ pageSize: 200 });
  return { employees: finalList.items, migration };
}

export function downloadEmployeeTemplate(): void {
  const headers = [
    "Sl No",
    "Employee No",
    "Employee Name",
    "Designation",
    "Department",
    "Location",
    "Reporting Manager",
    "Employee Grade",
    "Man-hour Expenses",
    "Status",
  ];
  const worksheet = XLSX.utils.aoa_to_sheet([headers]);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Template");

  XLSX.writeFile(workbook, "Employee_Master_Template.xlsx");
}
