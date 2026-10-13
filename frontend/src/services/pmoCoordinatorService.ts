import { apiClient } from "./apiClient";

/**
 * PMO Coordinators — backed by the Settings-managed registry (Oct 2026),
 * replacing the old hardcoded name list.
 *
 * - getPmoCoordinatorOptions(): the General Information picker list
 *   (GET /projects/pmo-coordinators — any Projects or Approvals user).
 * - The registry CRUD calls below: Settings → PMO Coordinators
 *   (Administrator / PMO Manager with the Settings module; the backend
 *   enforces this regardless of what the UI shows).
 */

export type PmoCoordinatorStatus =
  | "eligible"
  | "no_account"
  | "ambiguous_account"
  | "inactive"
  | "locked"
  | "no_projects_module";

export const PMO_COORDINATOR_STATUS_LABELS: Record<PmoCoordinatorStatus, string> = {
  eligible: "Eligible",
  no_account: "No account",
  ambiguous_account: "Duplicate accounts",
  inactive: "Inactive",
  locked: "Locked",
  no_projects_module: "No Projects access",
};

export interface PmoCoordinatorOption {
  id: string;
  displayName: string;
  email: string;
  status: PmoCoordinatorStatus;
  statusMessage: string;
  selectable: boolean;
  /** The resolved PMO Portal account — used to pre-select the project's current coordinator. */
  accountId: string | null;
}

export interface PmoCoordinatorEntry {
  id: string;
  displayName: string;
  email: string;
  status: PmoCoordinatorStatus;
  reasons: PmoCoordinatorStatus[];
  account: { id: string; fullName: string } | null;
  matchingAccountCount: number;
  assignedProjectCount: number;
  createdAt: string;
  updatedAt: string;
}

let cachedOptions: PmoCoordinatorOption[] = [];

export const getPmoCoordinatorOptions = (): Promise<PmoCoordinatorOption[]> =>
  apiClient.get<{ items: PmoCoordinatorOption[] }>("/projects/pmo-coordinators").then((res) => {
    cachedOptions = res.items;
    return res.items;
  });

/**
 * Registered names from the last successful load — used by the Excel
 * workbook's PMO Coordinator dropdown (call getPmoCoordinatorOptions()
 * first; see projectWorkbookService.ts). Empty until loaded.
 */
export function getPmoCoordinators(): string[] {
  return Array.from(new Set(cachedOptions.map((o) => o.displayName)));
}

export const getPmoCoordinatorRegistry = (): Promise<PmoCoordinatorEntry[]> =>
  apiClient.get<{ items: PmoCoordinatorEntry[] }>("/pmo-coordinators").then((res) => res.items);

export const createPmoCoordinator = (payload: { displayName: string; email: string }): Promise<PmoCoordinatorEntry> =>
  apiClient.post<PmoCoordinatorEntry>("/pmo-coordinators", payload);

/** The backend refuses an email change while any project (active or archived) is assigned to the entry's account. */
export const updatePmoCoordinator = (
  id: string,
  payload: { displayName?: string; email?: string }
): Promise<PmoCoordinatorEntry> => apiClient.patch<PmoCoordinatorEntry>(`/pmo-coordinators/${id}`, payload);

/** The backend refuses removal while any project (active or archived) is assigned to the entry's account. */
export const removePmoCoordinator = (id: string): Promise<void> =>
  apiClient.delete<void>(`/pmo-coordinators/${id}`);
