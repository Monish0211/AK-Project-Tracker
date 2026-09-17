import { apiClient } from "./apiClient";

// =============================================================================
// NOTES — dedicated read-only register page (Sept 2026)
// =============================================================================
// This is deliberately NOT a second Notes system: it reads the exact same
// ProjectNote rows the existing Project Workspace Notes tab already creates
// and reads (see ProjectNotesService.ts / Backend's projectNote.repository.ts).
// This file only adds the one new read path — GET /projects/notes — that
// returns every note across every project the caller is authorized to see,
// batched in a single backend query. No note create/update/delete lives
// here; this page cannot mutate notes at all.

/** One row of GET /projects/notes — see Backend's projectNote.service.ts::listAllNotesForCaller(). */
export interface AllNotesListItem {
  id: string;
  projectId: string;
  prNo: string;
  message: string;
  createdBy: string;
  createdAt: string;
}

interface AllNotesListResponse {
  items: AllNotesListItem[];
}

/**
 * Every note across every project the caller is authorized to see, in one
 * request — the backend applies the exact same project-visibility rule
 * every other cross-project list uses (Administrator/PMO Manager see
 * every project's notes; everyone else sees only their own authorized
 * projects' notes). Never writes anything to localStorage — this is a
 * pure, read-only fetch for the dedicated Notes page's own React state.
 */
export async function fetchAllNotesForCaller(): Promise<AllNotesListItem[]> {
  const result = await apiClient.get<AllNotesListResponse>("/projects/notes");
  return result.items;
}
