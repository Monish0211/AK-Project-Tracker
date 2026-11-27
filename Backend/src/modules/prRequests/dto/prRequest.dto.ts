import type { PRRequestProjectDataInput } from "../validators/prRequest.validators.js";

/**
 * Draft | Pending Accounts Approval | Pending PMO Manager Approval | Approved | Rejected
 * — mirrors PRRequest.status in schema.prisma exactly. Kept as a union type
 * here (not a DB enum, matching this codebase's own convention) purely so
 * the frontend/service layer gets autocomplete + exhaustiveness checks.
 */
export type PRRequestStatus =
  | "Draft"
  | "Pending Accounts Approval"
  | "Pending PMO Manager Approval"
  | "Approved"
  | "Rejected"
  /** Administrative Controls: deleted by a PR Approval Administration holder (soft delete - the request and its history are kept). */
  | "Deleted";

/** Submitted | Edited | AccountsApproved | PmoManagerApproved | Rejected — mirrors PRRequestApprovalHistory.action. "Edited" is logged only for an approver's correction while a stage is pending, never for the requester's own pre-submission Draft edits. */
export type PRRequestApprovalAction =
  | "Submitted"
  | "Edited"
  | "AccountsApproved"
  | "PmoManagerApproved"
  | "Rejected"
  // Administrative Controls (Nov 2026): actions by a PR Approval Administration holder. The actor is the administrator; onBehalfOf the assigned approver.
  | "AdminEdited"
  | "AdminAccountsApproved"
  | "AdminPmoManagerApproved"
  | "AdminRejected"
  | "Reassigned"
  | "AdminDeleted";

export interface PRRequestApprovalHistoryDto {
  id: string;
  actorUserId: string;
  actorName: string;
  action: PRRequestApprovalAction;
  remarks: string | null;
  /** The assigned approver an administrator acted for; null for every ordinary action. */
  onBehalfOfUserId: string | null;
  onBehalfOfName: string | null;
  createdAt: Date;
}

export interface PRRequestDto {
  id: string;
  requestedByUserId: string;
  requestedByName: string;
  assignedAccountsApproverId: string | null;
  assignedAccountsApproverName: string | null;
  assignedPmoManagerId: string | null;
  assignedPmoManagerName: string | null;
  projectData: PRRequestProjectDataInput;
  status: PRRequestStatus;
  createdProjectId: string | null;
  rejectedByUserId: string | null;
  rejectedByName: string | null;
  rejectionReason: string | null;
  rejectedAt: Date | null;
  /** Administrative delete (status "Deleted"): who, when and why. */
  deletedByName: string | null;
  deleteReason: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PRRequestDetailDto extends PRRequestDto {
  approvalHistory: PRRequestApprovalHistoryDto[];
  /**
   * The currency of the request's country (Region.defaultCurrency, found from its PR Category - never inferred from the amounts). The detail page needs it to
   * tell whether the transaction currency differs from the regional one. null = the category has no country or currency configured yet (a legacy-style INR request).
   */
  regionalCurrency: string | null;
}

/** GET /users/by-role — minimal shape, deliberately narrower than the full User Directory row (see user.repository.ts's findActiveUsersByRoleName). */
export interface UserByRoleDto {
  id: string;
  fullName: string;
}
