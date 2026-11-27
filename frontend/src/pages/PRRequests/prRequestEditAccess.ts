import type { UserSession } from "../../auth/authService";
import type { PRRequestStatus } from "../../types/PRRequest";

/**
 * Where the Edit button on the PR detail page leads, or null when the viewer may not edit that request.
 *
 * This repeats - it does not replace - the rule the server already enforces in updatePRRequestProjectData (prRequest.service.ts) and that the review form
 * (RequestPR.tsx) applies when it opens: a Draft is edited by its requester (module "PR Request"); a request pending at a stage is edited by the person
 * assigned to THAT stage (module "Approvals"); a finalized request (Approved, Rejected, Deleted) is not editable. An administrator holding the
 * "PR Approval Administration" right edits through the existing administrative review page. Nothing new is granted: the destination re-checks everything and
 * the server refuses an unauthorized save, so a wrongly shown button could never edit anything.
 */
export interface EditableRequestFields {
  id: string;
  status: PRRequestStatus;
  requestedByUserId: string;
  assignedAccountsApproverId: string | null;
  assignedPmoManagerId: string | null;
}

export function prRequestEditPath(request: EditableRequestFields, user: Pick<UserSession, "id" | "modules"> | null, admin: boolean): string | null {
  if (!user) return null;
  const holds = (moduleName: string): boolean => user.modules.includes(moduleName);

  if (admin) {
    // The administrative detail page is itself open to right holders only (AdminRightRoute); the review page behind this link re-checks the right.
    return request.status === "Draft" || request.status === "Pending Accounts Approval" || request.status === "Pending PMO Manager Approval"
      ? `/admin/pr-requests/${request.id}/review`
      : null;
  }

  const path = `/pr-requests/${request.id}/edit`;
  if (request.status === "Draft") return request.requestedByUserId === user.id && holds("PR Request") ? path : null;
  if (request.status === "Pending Accounts Approval") return request.assignedAccountsApproverId === user.id && holds("Approvals") ? path : null;
  if (request.status === "Pending PMO Manager Approval") return request.assignedPmoManagerId === user.id && holds("Approvals") ? path : null;
  return null;
}
