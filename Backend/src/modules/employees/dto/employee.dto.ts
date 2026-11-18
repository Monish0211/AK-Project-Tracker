/**
 * Employee (Manpower) response/list shapes — same split as project.dto.ts.
 */
export interface EmployeeDto {
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

  dateOfJoining: Date | null;
  employeeType: string | null;

  createdAt: Date;
  updatedAt: Date;

  /**
   * Phase 4 / Option A: present only on the response of a save that changed this employee's hourly rate on an employee with project assignments. status
   * is SUCCEEDED when every affected project was recalculated; PARTIAL / FAILED / PENDING means some projects are still not current (visible on those
   * projects, retryable by an authorised user). The rate itself is saved either way.
   */
  costingRefresh?: { runId: string; status: string; projectCount: number; succeededCount: number; failedCount: number };
}

export interface PaginatedEmployeeListDto {
  items: EmployeeDto[];
  total: number;
  page: number;
  pageSize: number;
}

/** POST /employees/import response. */
export interface ImportEmployeesResultDto {
  added: number;
  updated: number;
  totalImported: number;
  invalid: number;
  /** Phase 4 / Option A: how many rate changes in this import triggered a manpower recalculation, and how many of those are not yet complete. Absent when none did. */
  costingRefresh?: { runs: number; incompleteRuns: number };
  /**
   * Phase 4 / Option A safeguard: rows whose hourly rate was blank or unreadable. NOT_PROVIDED = the cell was blank or the column missing; UNREADABLE = the cell
   * had text that is not a number. An existing employee's rate is KEPT (EXISTING_RATE_KEPT) and triggers no recalculation; a new employee has no rate to keep,
   * so it is created with the default rate 0 (CREATED_WITH_DEFAULT_0) and the row is listed here so the missing rate can be entered. Absent when none.
   */
  ratesSkipped?: { employeeNo: string; reason: "NOT_PROVIDED" | "UNREADABLE"; outcome: "EXISTING_RATE_KEPT" | "CREATED_WITH_DEFAULT_0" }[];
}
