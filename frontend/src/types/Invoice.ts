export interface Invoice {
  // Unique Internal ID
  id: string;

  // Project Reference
  projectId: string;

  // Project Details
  prNo: string;
  client: string;

  // Auto Generated
  invoiceRef: string;

  // Dates
  invoiceDate: string;
  dueDate: string;

  // Financial Details
  invoiceAmount: number;
  receivedAmount: number;
  outstandingAmount: number;

  // Status
  status:
    | "Raised"
    | "Partially Paid"
    | "Paid"
    | "Overdue"
    | "Cancelled";

  // Additional Information
  remarks: string;

  // Audit Fields
  createdAt: string;
  updatedAt: string;
}
