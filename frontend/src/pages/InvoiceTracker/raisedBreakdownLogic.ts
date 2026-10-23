import type { RaisedBreakdownPage, RaisedBreakdownProject, TrackerFilter } from "../../services/invoiceTrackerService";
import { TRACKER_FILTERS } from "./trackerFormat";

/**
 * The rules of the Raised-amount breakdown that are not drawing: when a stored answer is still the right one, how pages combine, what the panel
 * shows in each state, which projects are expanded. Pure functions, so they are tested directly. (No amounts are added up here: every figure is the server's.)
 */

/** What the list is currently showing — the breakdown is requested for exactly this, so it always explains the card next to it. */
export interface BreakdownQuery {
  month: string;
  search: string;
  projectStatus: string;
  filter: TrackerFilter;
}

/** Identifies one request: a different month, search, status, "Show" filter, page refresh or retry is a different answer. */
export const requestKeyOf = (q: BreakdownQuery, refreshKey: number, retryTick: number): string => `${q.month}|${q.search}|${q.projectStatus}|${q.filter}|${refreshKey}#${retryTick}`;

export interface BreakdownData {
  status: "idle" | "loading" | "error" | "ready";
  error: string | null;
  totalINR: number;
  invoiceCount: number;
  projectCount: number;
  projects: RaisedBreakdownProject[];
  hasMore: boolean;
  loadingMore: boolean;
  moreError: string | null;
}

export const IDLE_BREAKDOWN: BreakdownData = { status: "idle", error: null, totalINR: 0, invoiceCount: 0, projectCount: 0, projects: [], hasMore: false, loadingMore: false, moreError: null };

/** The projects of every loaded page, in the server's order, each once (a project that moved between pages is not shown twice). */
export function mergeProjectPages(pages: RaisedBreakdownPage[]): RaisedBreakdownProject[] {
  const seen = new Set<string>();
  const out: RaisedBreakdownProject[] = [];
  for (const page of pages) {
    for (const project of page.projects) {
      if (seen.has(project.projectId)) continue;
      seen.add(project.projectId);
      out.push(project);
    }
  }
  return out;
}

/**
 * What the panel shows. `enabled` = the dialog is open; `answered` = a response (or failure) for THIS request key is in hand; `pages` = the loaded
 * pages of this key, first page first (empty when the first request failed). Closed and never answered → idle; open and waiting → loading; the header
 * figures (total, counts) are the whole report's and come from the first page.
 */
export function deriveBreakdown(input: { enabled: boolean; answered: boolean; pages: RaisedBreakdownPage[]; error: string | null; loadingMore: boolean; moreError: string | null }): BreakdownData {
  const { enabled, answered, pages, error, loadingMore, moreError } = input;
  if (!enabled && !answered) return IDLE_BREAKDOWN;
  if (!answered) return { ...IDLE_BREAKDOWN, status: "loading" };
  const head = pages[0];
  if (!head) return { ...IDLE_BREAKDOWN, status: "error", error: error ?? "Something went wrong. Please try again." };
  const last = pages[pages.length - 1]!;
  return {
    status: "ready",
    error: null,
    totalINR: head.totalINR,
    invoiceCount: head.invoiceCount,
    projectCount: head.projectCount,
    projects: mergeProjectPages(pages),
    hasMore: last.page < last.totalPages,
    loadingMore,
    moreError,
  };
}

/** "Filtered by …" — says out loud that the breakdown follows the list's filters; "" when the whole month is shown. */
export function filterNoteOf(q: BreakdownQuery): string {
  const parts: string[] = [];
  if (q.search) parts.push(`search “${q.search}”`);
  if (q.projectStatus) parts.push(`status ${q.projectStatus}`);
  if (q.filter !== "all") parts.push(TRACKER_FILTERS.find((f) => f.value === q.filter)?.label ?? q.filter);
  return parts.length > 0 ? `Filtered by ${parts.join(" · ")} — the same filters as the list.` : "";
}

/** Expansion state: what the user chose per project; a project nobody touched is open only when it is the ONLY project. */
export type ExpansionOverrides = ReadonlyMap<string, boolean>;
export const isProjectOpen = (overrides: ExpansionOverrides, projectId: string, onlyOneProject: boolean): boolean => overrides.get(projectId) ?? onlyOneProject;
export const withProjectToggled = (overrides: ExpansionOverrides, projectId: string, currentlyOpen: boolean): ExpansionOverrides => new Map(overrides).set(projectId, !currentlyOpen);
export const withEveryProject = (projects: { projectId: string }[], open: boolean): ExpansionOverrides => new Map(projects.map((p) => [p.projectId, open]));
