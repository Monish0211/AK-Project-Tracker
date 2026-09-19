/**
 * Single shared source for the Project/Work Order status vocabulary used
 * everywhere a manual dropdown or lookup list needs it — mirrors Backend's
 * project.constants.ts exactly (Backend/src/modules/projects/project.constants.ts),
 * which is what the manual create/update API actually validates against.
 *
 * Used by:
 *  - GeneralInfoCard.tsx's Project Status / Work Order Status <Select> options.
 *  - projectWorkbookService.ts's Lookup-sheet dropdown generation for new
 *    manual Excel entries.
 *
 * NOT used by the Excel import parsing/validation path itself — that stays
 * permissive by design (see importProjectRowSchema in Backend's
 * project.validators.ts) so historical free-form values ("Hold", "In
 * progress", "Issued", etc.) already present in real project data are never
 * rejected on import.
 *
 * Sept 2026 — Project Status Workflow Expansion. Added 8 granular workflow
 * stages (Allotted to Tech team ... Final Report Submitted) alongside the
 * original 6 values. "Ongoing" (no hyphen) is the pre-existing value and is
 * kept as-is for backward compatibility — a production audit at the time
 * this was added found 0 existing projects using it, but it remains a valid
 * selectable/importable value rather than being silently removed. "On-going"
 * (hyphenated) is the new, distinct workflow-stage value requested for this
 * expansion; the two are intentionally NOT merged into one value so no
 * existing project's stored status string is ever silently reinterpreted.
 */
export const PROJECT_STATUS_OPTIONS = [
  "Not Started",
  "Ongoing",
  "Active",
  "Allotted to Tech team",
  "KoM Completed",
  "Data Request Shared",
  "On-going",
  "Draft Report Submitted",
  "Comments Received",
  "Updated Report Submitted",
  "Final Report Submitted",
  "On Hold",
  "Completed",
  "Cancelled",
] as const;

export const WORK_ORDER_STATUS_OPTIONS = ["Received", "Yet to Receive", "Pending", "Closed", "Cancelled"] as const;

/**
 * Centralized "Active Project" classification — Sept 2026 Project Status
 * Workflow Expansion. Project Status (the workflow stage) and "is this
 * project active" are deliberately different concepts: a project can move
 * through many workflow-stage statuses (KoM Completed, Data Request Shared,
 * Draft Report Submitted, ...) while remaining an active, in-progress
 * project the whole time. Any dashboard/summary card that needs an "Active
 * Projects" count MUST call isActiveProjectStatus() (or filter against
 * ACTIVE_PROJECT_STATUSES) instead of comparing projectStatus === "Active"
 * directly, so the definition lives in exactly one place.
 *
 * "Not Started" is deliberately excluded — it was never counted as Active
 * by the pre-existing Project Repository Quick Summary (which only ever
 * counted a literal "Active" match), so this preserves that existing
 * business behavior rather than silently reclassifying it.
 * Completed / Cancelled / On Hold are deliberately excluded per the
 * explicit business rule for this expansion.
 */
export const ACTIVE_PROJECT_STATUSES: ReadonlySet<string> = new Set([
  "Active",
  "Ongoing",
  "On-going",
  "Allotted to Tech team",
  "KoM Completed",
  "Data Request Shared",
  "Draft Report Submitted",
  "Comments Received",
  "Updated Report Submitted",
  "Final Report Submitted",
]);

export function isActiveProjectStatus(status: string | null | undefined): boolean {
  return !!status && ACTIVE_PROJECT_STATUSES.has(status);
}
