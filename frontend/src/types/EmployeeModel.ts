export interface Employee {
  id: string;

  employeeNo: string;
  employeeName: string;
  designation: string;
  department: string;
  location: string;
  reportingManager: string;
  grade: string;
  manhourExpenses: number;

  status: "Active" | "Inactive";

  // Phase 3.7 — optional, no prior UI field before this phase.
  dateOfJoining?: string;
  employeeType?: string;

  createdAt: string;
}