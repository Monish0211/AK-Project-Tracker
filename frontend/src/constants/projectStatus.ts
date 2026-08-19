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
 */
export const PROJECT_STATUS_OPTIONS = ["Not Started", "Ongoing", "Active", "On Hold", "Completed", "Cancelled"] as const;

export const WORK_ORDER_STATUS_OPTIONS = ["Received", "Yet to Receive", "Pending", "Closed", "Cancelled"] as const;
