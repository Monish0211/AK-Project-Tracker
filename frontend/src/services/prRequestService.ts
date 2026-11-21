import { apiClient } from "./apiClient";
import type { AdminPRRequest, PRRequest, PRRequestDetail, PRRequestProjectData, UserByRole } from "../types/PRRequest";

/** PR Request & Two-Level Approval Workflow — thin wrapper over Backend's /pr-requests routes, same one-function-per-endpoint convention as every other service in this folder. */

export interface SaveDraftPRRequestPayload {
  projectData: PRRequestProjectData;
}

/** Creates a new Draft — no Assigned PMO Manager here at all (see PRRequest.assignedPmoManagerId's own comment: that's chosen at Send to Accounts time, a separate action). */
export const saveDraftPRRequest = (payload: SaveDraftPRRequestPayload): Promise<PRRequest> =>
  apiClient.post<PRRequest>("/pr-requests", payload);

/** Edits a PR Request's project data in place — the requester while it's still a Draft, OR the currently assigned approver while their stage is pending (a review-time correction, logged to the approval history). */
export const updatePRRequestProjectData = (id: string, payload: SaveDraftPRRequestPayload): Promise<PRRequest> =>
  apiClient.patch<PRRequest>(`/pr-requests/${id}`, payload);

/** Discards a Draft — only while it's still a Draft. */
export const deleteDraftPRRequest = (id: string): Promise<void> => apiClient.delete(`/pr-requests/${id}`);

/** The real submission action, separate from the Draft form — picks the Assigned Accounts Approver and the Assigned PMO Manager, and starts the approval chain. */
export const sendToAccounts = (id: string, assignedAccountsApproverId: string, assignedPmoManagerId: string): Promise<PRRequest> =>
  apiClient.post<PRRequest>(`/pr-requests/${id}/send-to-accounts`, { assignedAccountsApproverId, assignedPmoManagerId });

export const getMyPRRequests = (): Promise<PRRequest[]> => apiClient.get<PRRequest[]>("/pr-requests/mine");

export const getApprovalsQueue = (): Promise<PRRequest[]> => apiClient.get<PRRequest[]>("/pr-requests/queue");

export const getPRRequestDetail = (id: string): Promise<PRRequestDetail> =>
  apiClient.get<PRRequestDetail>(`/pr-requests/${id}`);

export const accountsApprovePRRequest = (id: string, remarks?: string): Promise<PRRequest> =>
  apiClient.post<PRRequest>(`/pr-requests/${id}/accounts-approve`, { remarks: remarks || undefined });

export const pmoManagerApprovePRRequest = (id: string, remarks?: string): Promise<PRRequest> =>
  apiClient.post<PRRequest>(`/pr-requests/${id}/pmo-approve`, { remarks: remarks || undefined });

export const rejectPRRequest = (id: string, reason: string): Promise<PRRequest> =>
  apiClient.post<PRRequest>(`/pr-requests/${id}/reject`, { reason });

/** Narrowly-scoped user lookup (id + fullName only) — reachable by a "PR Request User" who has no Users module access. Omit `role` for the Assigned Accounts Approver picker, which deliberately lists every active user. */
export const getUsersByRole = (role?: string): Promise<UserByRole[]> =>
  apiClient.get<UserByRole[]>(role ? `/users/by-role?role=${encodeURIComponent(role)}` : "/users/by-role");

// ---- Administrative Controls: PR Approval Administration (holders only; the server checks the right on every call) ----

export interface AdminPRRequestFilters {
  status?: string;
  prCategory?: string;
  approverId?: string;
  from?: string;
  to?: string;
}

export const listAllPRRequestsForAdmin = (filters: AdminPRRequestFilters = {}): Promise<AdminPRRequest[]> => {
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => !!v) as [string, string][]).toString();
  return apiClient.get<AdminPRRequest[]>(`/pr-requests/admin/all${qs ? `?${qs}` : ""}`);
};

export const getPRRequestDetailForAdmin = (id: string): Promise<PRRequestDetail & AdminPRRequest> =>
  apiClient.get<PRRequestDetail & AdminPRRequest>(`/pr-requests/${id}/admin`);

export const adminEditPRRequest = (id: string, projectData: PRRequestProjectData, reason: string): Promise<PRRequest> =>
  apiClient.put<PRRequest>(`/pr-requests/${id}/admin/data`, { projectData, reason });

export const adminApprovePRRequest = (id: string, reason: string): Promise<PRRequest> =>
  apiClient.post<PRRequest>(`/pr-requests/${id}/admin/approve`, { reason });

export const adminRejectPRRequest = (id: string, reason: string): Promise<PRRequest> =>
  apiClient.post<PRRequest>(`/pr-requests/${id}/admin/reject`, { reason });

export const adminReassignPRRequest = (
  id: string,
  body: { assignedAccountsApproverId?: string; assignedPmoManagerId?: string; reason: string }
): Promise<PRRequest> => apiClient.post<PRRequest>(`/pr-requests/${id}/admin/reassign`, body);

export const adminDeletePRRequest = (id: string, reason: string): Promise<PRRequest> =>
  apiClient.post<PRRequest>(`/pr-requests/${id}/admin/delete`, { reason });
