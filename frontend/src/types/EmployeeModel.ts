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

  createdAt: string;
}