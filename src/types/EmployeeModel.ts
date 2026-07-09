export interface Employee {
  id: string;

  employeeNo: string;
  employeeName: string;
  designation: string;
  department: string;
  location: string;
  reportingManager: string;
  grade: string;
  remarks?: string;

  status: "Active" | "Inactive";

  createdAt: string;
}