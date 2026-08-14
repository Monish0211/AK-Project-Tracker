/**
 * Shared shapes reused across the Employee (Manpower) module's layers
 * (repository, service, controller) — mirrors project.repository.ts's
 * ProjectGeneralInfoData is the one shape every layer of Projects agrees on.
 * `employeeNo` is the natural business key every other module already
 * references (TimesheetEntry, the pre-existing frontend ProjectResource
 * type) — kept as the primary matching key here too, alongside the
 * surrogate `id` every table in this app already has.
 */
export interface EmployeeData {
  employeeNo: string;
  employeeName: string;
  department: string;
  designation: string;
  reportingManager?: string | null;
  grade: string;
  location: string;

  // "Current Hourly Rate" in business terms — kept under the frontend's own
  // existing field name (see EmployeeModal.tsx / Excel import template).
  manhourExpenses: number;

  status: string;

  dateOfJoining?: Date | null;
  employeeType?: string | null;
}
