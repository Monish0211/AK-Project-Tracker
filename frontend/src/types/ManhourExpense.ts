export interface ManhourExpense {
  id: string;

  employeeName: string;

  employeeNo: string;

  department: string;

  reportingManager: string;

  manhourRate: number;

  bookedHours: number;

  totalCost: number;

  remarks: string;
}