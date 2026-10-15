/**
 * PR Request & Two-Level Approval Workflow — frontend mirror of the
 * backend's PRRequestDto/PRRequestDetailDto (Backend/src/modules/prRequests/
 * dto/prRequest.dto.ts).
 */

export type PRRequestStatus =
  | "Draft"
  | "Pending Accounts Approval"
  | "Pending PMO Manager Approval"
  | "Approved"
  | "Rejected";

export type PRRequestApprovalAction = "Submitted" | "AccountsApproved" | "PmoManagerApproved" | "Rejected";

/** Mirrors Backend's prRequestProjectDataSchema exactly — the same General/Expense-Budget fields createProjectSchema validates, plus quantityItems[]/paymentMilestones[] (Backend's createQuantitySchema/createMilestoneSchema, unchanged). */
export interface PRRequestQuantityItemData {
  description: string;
  woQty: number;
  uom: string;
  assignedTo?: string | null;
  currency: string;
  unitRate: number;
  exchangeRate: number;
}

export interface PRRequestPaymentMilestoneData {
  milestoneName: string;
  paymentPercentage: number;
  dueDate?: string | null;
}

export interface PRRequestProjectData {
  poMonth: string;
  prCategory: string;
  prNo: string;
  /** Optional in the type only because Drafts saved before RFQ No. existed don't carry it. */
  rfqNo?: string;
  client: string;
  department: string;
  domesticForeign: string;
  projectTitle: string;
  workOrderStatus: string;
  projectStartDate: string;
  projectEndDate?: string | null;
  projectStatus: string;
  workOrderNumber: string;
  workOrderDate: string;
  eicName: string;
  contactNumber?: string | null;
  emailId?: string | null;
  estimatedDuration?: number | null;
  durationUnit?: "Days" | "Weeks" | "Months" | null;
  contractType: string;
  pmoCoordinator: string;
  /** PMO Coordinator registry entry picked in the form; linked to the coordinator's account when the request is approved. */
  pmoCoordinatorEntryId?: string;
  paymentType: "Single" | "Multiple";
  gstApplicable: boolean;
  currency: string;
  currentExchangeRate: number;
  contractExchangeRate: number;
  manhourBudgetAmount?: number | null;
  manhourBudgetHours?: number | null;
  manhourBudgetRemarks?: string | null;
  nonManhourBudgetAmount?: number | null;
  nonManhourBudgetRemarks?: string | null;
  remarks?: string | null;
  quantityItems: PRRequestQuantityItemData[];
  paymentMilestones: PRRequestPaymentMilestoneData[];
}

export interface PRRequestApprovalHistoryEntry {
  id: string;
  actorUserId: string;
  actorName: string;
  action: PRRequestApprovalAction;
  remarks: string | null;
  createdAt: string;
}

export interface PRRequest {
  id: string;
  requestedByUserId: string;
  requestedByName: string;
  assignedAccountsApproverId: string | null;
  assignedAccountsApproverName: string | null;
  assignedPmoManagerId: string | null;
  assignedPmoManagerName: string | null;
  projectData: PRRequestProjectData;
  status: PRRequestStatus;
  createdProjectId: string | null;
  rejectedByUserId: string | null;
  rejectedByName: string | null;
  rejectionReason: string | null;
  rejectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PRRequestDetail extends PRRequest {
  approvalHistory: PRRequestApprovalHistoryEntry[];
}

export interface UserByRole {
  id: string;
  fullName: string;
}
