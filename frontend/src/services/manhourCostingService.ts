import { apiClient } from "./apiClient";
import type { ManhourCosting } from "../utils/manhourCosting";

/** Phase 4 / Option A - the central manpower costing (one read model for every screen) and the recovery of a recalculation that did not complete. */

export interface OpenRefreshRun {
  runId: string;
  employeeNo: string;
  source: string;
  previousRate: number | null;
  newRate: number;
  status: string;
  actorName: string;
  createdAt: string;
  lastError: string | null;
  openProjects: { taskId: string; projectId: string; prNo: string; status: string; attempts: number; lastError: string | null }[];
}

export function getProjectManhourCosting(projectId: string): Promise<ManhourCosting> {
  return apiClient.get<ManhourCosting>(`/projects/${projectId}/manhour-costing`);
}

/** Needs the Manpower module (the same grant that lets a user change an employee's rate). */
export async function getOpenRefreshRuns(): Promise<OpenRefreshRun[]> {
  const result = await apiClient.get<{ items: OpenRefreshRun[] }>("/manhour-refresh/runs");
  return result.items;
}

export function retryRefreshRun(runId: string): Promise<{ runId: string; status: string; projectCount: number; succeededCount: number; failedCount: number }> {
  return apiClient.post(`/manhour-refresh/runs/${runId}/retry`, {});
}
