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
  | "Rejected"
  /** Administrative Controls: deleted by a PR Approval Administration holder (kept, hidden from ordinary lists). */
  | "Deleted";

export type PRRequestApprovalAction =
  | "Submitted"
  | "Edited"
  | "AccountsApproved"
  | "PmoManagerApproved"
  | "Rejected"
  | "AdminEdited"
  | "AdminAccountsApproved"
  | "AdminPmoManagerApproved"
  | "AdminRejected"
  | "Reassigned"
  | "AdminDeleted";

/** How each history action reads on screen. */
export const PR_ACTION_LABELS: Record<PRRequestApprovalAction, string> = {
  Submitted: "Submitted",
  Edited: "Edited by approver",
  AccountsApproved: "Accounts approved",
  PmoManagerApproved: "PMO Manager approved",
  Rejected: "Rejected",
  AdminEdited: "Edited by administrator",
  AdminAccountsApproved: "Accounts stage approved by administrator",
  AdminPmoManagerApproved: "PMO Manager stage approved by administrator",
  AdminRejected: "Rejected by administrator",
  Reassigned: "Approver reassigned by administrator",
  AdminDeleted: "Deleted by administrator",
};

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
  /** Project Tax (outside India); absent on India requests and on requests saved before it existed. */
  taxApplicable?: boolean | null;
  taxRatePercent?: number | null;
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
  /** The assigned approver an administrator acted for (null for ordinary actions). */
  onBehalfOfUserId?: string | null;
  onBehalfOfName?: string | null;
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
  deletedByName?: string | null;
  deleteReason?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The admin register row: the request plus the request-data fields the register filters and shows. */
export interface AdminPRRequest extends PRRequest {
  prCategory: string;
  prNo: string;
  projectName: string;
  customerName: string;
}

export interface PRRequestDetail extends PRRequest {
  approvalHistory: PRRequestApprovalHistoryEntry[];
  /** The currency of the request's country, looked up by the server from its PR Category; null when the category has no country or currency configured. */
  regionalCurrency: string | null;
}

export interface UserByRole {
  id: string;
  fullName: string;
}
