/**
 * F6 perf/correctness fix (Sept 2026 audit) — "pmo:data-changed" itself is
 * NOT being removed or replaced (9 dispatch sites, 13 listener sites across
 * the app all still use this exact event name — see each call site). What
 * changed is that every dispatch now carries a small typed `detail` payload
 * naming which kind of data actually changed, so a listener that only cares
 * about one kind of data can ignore events about the others instead of
 * re-running on every single save anywhere in the app.
 *
 * This is opt-in, not a rewrite: `pmoDataChangedMatches()` with no
 * `entities` argument (or a legacy event with no `detail` at all) returns
 * true — the exact same "always react" behavior every listener already had
 * before this change. Only listeners explicitly updated to pass an
 * `entities` filter get narrower, verified-safe behavior; every other
 * listener is unaffected.
 */

/** Every distinct kind of data an existing dispatch site represents today. "project" is deliberately broad — invoices, quantities, expenses, milestones and payment data are all persisted as nested fields on the Project record in the current localStorage mirror (see saveProjects() in projectService.ts), so a save to any of them dispatches entity: "project", not a separate entity of their own. */
export type PmoEntity =
  | "project"
  | "customer"
  | "employee"
  | "department"
  | "reportingManager"
  | "timesheet"
  | "reminder"
  | "user";

export interface PmoDataChangedDetail {
  entity: PmoEntity;
  /** Only included where a dispatcher already has the changed id(s) on hand for free — never computed via an extra diff/lookup just to populate this. */
  ids?: string[];
}

export const PMO_DATA_CHANGED_EVENT = "pmo:data-changed";

export function dispatchPmoDataChanged(detail: PmoDataChangedDetail): void {
  window.dispatchEvent(new CustomEvent<PmoDataChangedDetail>(PMO_DATA_CHANGED_EVENT, { detail }));
}

/**
 * Whether a "pmo:data-changed" event is relevant to a listener that only
 * cares about specific entities. Omit `entities` (or pass none) to keep the
 * original "react to everything" behavior. A legacy/undetailed event (no
 * `detail`, which should no longer happen now every dispatch site sets one,
 * but is handled defensively) is always treated as relevant rather than
 * silently dropped.
 */
export function pmoDataChangedMatches(event: Event, entities?: PmoEntity[]): boolean {
  if (!entities || entities.length === 0) return true;
  const detail = (event as CustomEvent<PmoDataChangedDetail | undefined>).detail;
  if (!detail) return true;
  return entities.includes(detail.entity);
}
