import { apiClient } from "./apiClient";

/**
 * Settings > Administrative Controls (Nov 2026). The server decides everything (active Administrator, never on yourself, holders must be
 * active Administrators) and audits every grant, revoke and refusal; this file only calls it.
 */

export const PR_APPROVAL_ADMINISTRATION = "PR Approval Administration";
export const INVOICE_ADMINISTRATION = "Invoice Administration";
export type AdminControlRight = typeof PR_APPROVAL_ADMINISTRATION | typeof INVOICE_ADMINISTRATION;

export interface AdminControlsOverview {
  canManage: boolean;
  owners: { email: string; fullName: string | null }[];
  rights: { name: AdminControlRight; description: string | null }[];
  administrators: { id: string; fullName: string; email: string; isSelf: boolean; isOwner: boolean; rights: AdminControlRight[] }[];
  audit: { id: string; event: string; actorEmail: string; details: Record<string, unknown> | null; createdAt: string }[];
}

export const adminControlsService = {
  getOverview: () => apiClient.get<AdminControlsOverview>("/admin-controls"),
  setRight: (userId: string, body: { right: AdminControlRight; granted: boolean; reason: string }) =>
    apiClient.put<unknown>(`/admin-controls/users/${userId}/rights`, body),
  getMyRights: () => apiClient.get<{ rights: AdminControlRight[] }>("/admin-controls/me"),
};
