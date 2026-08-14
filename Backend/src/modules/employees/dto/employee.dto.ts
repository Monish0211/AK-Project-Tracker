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
}
