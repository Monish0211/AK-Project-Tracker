export interface Employee {
  id: string;

  employeeNo: string;

  employeeName: string;

  reportingManager: string;

  department: string;

  manhourRate: number;

  status: "Active" | "Inactive";

  createdAt: string;
}