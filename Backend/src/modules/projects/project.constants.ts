/**
 * Single shared source for the Project/Work Order status vocabulary used by
 * the ordinary manual create/update API validation (see
 * validators/project.validators.ts). Mirrors the frontend dropdown exactly
 * (frontend/src/pages/Projects/components/GeneralInfoCard.tsx) — kept as
 * plain string arrays (not a Prisma/TS enum) so the column itself stays a
 * flexible `String`, matching every other status-like field in this schema
 * (Employee.status, TimesheetImport.status, InvoiceLine.status).
 *
 * Deliberately NOT used by the Excel import path (importProjectRowSchema in
 * project.validators.ts overrides these two fields back to a permissive
 * free-text string) — real historical project data predates this
 * standardized vocabulary and uses free-form phrasing ("Hold", "In
 * progress", "Issued", etc.) that import must keep accepting. This list is
 * the enforced vocabulary for NEW data entered through the ordinary UI/API
 * only, never a filter applied to already-imported historical values.
 */
export const PROJECT_STATUS_VALUES = ["Not Started", "Ongoing", "Active", "On Hold", "Completed", "Cancelled"] as const;

export const WORK_ORDER_STATUS_VALUES = ["Received", "Yet to Receive", "Pending", "Closed", "Cancelled"] as const;
