import { z } from "zod";
import { PROJECT_STATUS_VALUES, WORK_ORDER_STATUS_VALUES } from "../project.constants.js";
import { dateInput } from "../../../shared/utils/dateInput.js";

/**
 * RFQ No. — the same rule on create and update: a string that is non-empty
 * after trimming. A missing value on create, or null/""/"   " on either,
 * gets `message` (zod's own "expected string" message would be unclear).
 */
function rfqNoField(message: string) {
  return z.string({ error: message }).trim().min(1, message).max(100, "RFQ No. cannot exceed 100 characters.");
}

/**
 * Every required field here matches validateGeneralTab() in
 * frontend/src/utils/projectValidation.ts exactly — the frontend already
 * blocks Save/Save & Next until these pass client-side, so the backend
 * schema exists to enforce the same contract server-side, not to invent new
 * rules the UI doesn't already have.
 */
export const createProjectSchema = z.object({
  poMonth: z.string().trim().min(1, "PO Month is required."),
  prCategory: z.string().trim().min(1, "PR Category is required."),
  prNo: z.string().trim().min(1, "PR Number is required."),
  // RFQ No. (Oct 2026) — free text (letters, digits, "-", "/" ...), trimmed,
  // never blank. Also covers Excel import and PR Request drafts/approval,
  // which reuse this schema.
  rfqNo: rfqNoField("RFQ No. is required."),
  client: z.string().trim().min(1, "Client Name is required."),
  department: z.string().trim().min(1, "Department is required."),
  domesticForeign: z.string().trim().min(1, "Domestic / Foreign is required."),
  projectTitle: z.string().trim().min(1, "Project Title is required."),

  workOrderStatus: z.enum(WORK_ORDER_STATUS_VALUES),
  projectStartDate: dateInput("Project Start Date"),
  projectEndDate: dateInput("Project End Date").optional().nullable(),
  projectStatus: z.enum(PROJECT_STATUS_VALUES),

  actualCompletionDate: dateInput("Actual Completion Date").optional().nullable(),
  completionRemarks: z.string().trim().min(1).optional().nullable(),
  completedBy: z.string().trim().min(1).optional().nullable(),
  completedTimestamp: dateInput("Completed Timestamp").optional().nullable(),
  // Liquidated Damages (Oct 2026) — shape only; the completion/LD business
  // rules (when LD may be recorded, amount range and precision, immutability)
  // live in projectCompletion.rules.ts. ldRecordedByUserId/ldRecordedAt are
  // deliberately absent: the server sets them from the session.
  ldApplicable: z.boolean().optional(),
  ldAmountINR: z.number().optional().nullable(),
  ldRemarks: z.string().optional().nullable(),

  workOrderNumber: z.string().trim().min(1, "Work Order Number is required."),
  workOrderDate: dateInput("Work Order Date"),
  eicName: z.string().trim().min(1, "EIC Name is required."),
  contactNumber: z.string().trim().min(1).optional().nullable(),
  emailId: z.string().trim().email("Enter a valid email address.").optional().nullable(),

  estimatedDuration: z.coerce.number().int().positive().optional().nullable(),
  durationUnit: z.enum(["Days", "Weeks", "Months"]).optional().nullable(),

  contractType: z.string().trim().min(1, "Contract Type is required.").default("LUMP SUM"),
  pmoCoordinator: z.string().trim().min(1, "PMO Coordinator is required."),

  // Payment Milestones — project-wide toggle, not per-milestone data (see
  // Backend/src/modules/milestones). Defaults to "Single" so existing
  // frontend callers that don't yet send this field keep working
  // unchanged, same technique as contractType's own default above.
  paymentType: z.enum(["Single", "Multiple"]).default("Single"),

  // Commercial Summary GST toggle. Defaults to false so a create request
  // from any frontend caller that doesn't yet send this field keeps
  // working unchanged — same technique as contractType/paymentType's own
  // defaults above.
  gstApplicable: z.boolean().default(false),

  // Quantity Details project-level currency defaults. Defaults match the
  // frontend's own pre-existing defaults (INR / rate 1) so a create request
  // from any caller that doesn't yet send these fields keeps working
  // unchanged — same technique as contractType/paymentType/gstApplicable's
  // own defaults above.
  currency: z.string().trim().min(1).default("INR"),
  currentExchangeRate: z.coerce.number().positive().default(1),
  contractExchangeRate: z.coerce.number().positive().default(1),

  // Expense Budget — Phase 3.5. Flat 1:1 fields on Project, all optional:
  // a brand-new project's General Information create request has no
  // reason to already know its budget, and ExpenseBudgetCard.tsx has no
  // required-field markers today (matching that exactly, not inventing new
  // required-field rules the UI doesn't already enforce).
  manhourBudgetAmount: z.coerce.number().min(0, "Man-Hour Budget Amount cannot be negative.").optional().nullable(),
  manhourBudgetHours: z.coerce.number().min(0, "Man-Hour Budget Hours cannot be negative.").optional().nullable(),
  manhourBudgetRemarks: z.string().trim().optional().nullable(),
  nonManhourBudgetAmount: z.coerce
    .number()
    .min(0, "Non Man-Hour Budget Amount cannot be negative.")
    .optional()
    .nullable(),
  nonManhourBudgetRemarks: z.string().trim().optional().nullable(),

  // Project Leadership — Phase 3.7. Flat 1:1 fields on Project, all
  // optional: a brand-new project's General Information create request has
  // no reason to already know its leadership team, matching every other
  // additive field set's precedent (Expense Budget, Phase 3.5).
  primaryProjectManager: z.string().trim().optional().nullable(),
  secondaryProjectManager: z.string().trim().optional().nullable(),
  projectEngineer: z.string().trim().optional().nullable(),
  projectCoordinator: z.string().trim().optional().nullable(),
  clientCoordinator: z.string().trim().optional().nullable(),

  // Project Remarks — optional free-text timeline/delay explanation.
  // Capped at 1000 characters here (the one authoritative enforcement
  // point — see schema.prisma's own comment on why this isn't a
  // @db.VarChar). Same optional/nullable treatment as every other
  // free-text field above (primaryProjectManager etc.) — no reason to
  // already have this on create.
  remarks: z.string().trim().max(1000, "Remarks cannot exceed 1000 characters.").optional().nullable(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/**
 * PMO Coordinator Management (Oct 2026) — the registry entry chosen in the
 * General Information picker. When present, the server validates it and
 * links the project to that entry's account (pmoCoordinatorUserId), and the
 * stored pmoCoordinator text becomes the entry's name. Deliberately NOT part
 * of createProjectSchema itself: Excel import and PR Request approval reuse
 * that schema and stay text-only (zod strips an unknown key there), so they
 * can never grant coordinator access.
 */
const pmoCoordinatorEntryIdField = z.string().trim().min(1, "PMO Coordinator selection is invalid.").optional();

/** POST /projects (the single-project form) only. */
export const createProjectRequestSchema = createProjectSchema.extend({
  pmoCoordinatorEntryId: pmoCoordinatorEntryIdField,
});

export type CreateProjectRequestInput = z.infer<typeof createProjectRequestSchema>;

/**
 * Same fields as createProjectSchema, all optional — a PATCH only needs to
 * carry the fields that changed. contractType keeps no default here (unlike
 * create) since omitting it on an update must leave the existing value
 * alone, not silently reset it to "LUMP SUM".
 */
export const updateProjectSchema = z.object({
  poMonth: z.string().trim().min(1).optional(),
  prCategory: z.string().trim().min(1).optional(),
  prNo: z.string().trim().min(1).optional(),
  // RFQ No. — may be omitted (partial PATCHes from other screens, and
  // projects that predate the field), but when sent it can never be blank or
  // null, so an existing RFQ No. can only be replaced, not cleared.
  rfqNo: rfqNoField("RFQ No. cannot be empty.").optional(),
  client: z.string().trim().min(1).optional(),
  department: z.string().trim().min(1).optional(),
  domesticForeign: z.string().trim().min(1).optional(),
  projectTitle: z.string().trim().min(1).optional(),

  workOrderStatus: z.enum(WORK_ORDER_STATUS_VALUES).optional(),
  projectStartDate: dateInput("Project Start Date").optional(),
  projectEndDate: dateInput("Project End Date").optional().nullable(),
  projectStatus: z.enum(PROJECT_STATUS_VALUES).optional(),

  actualCompletionDate: dateInput("Actual Completion Date").optional().nullable(),
  completionRemarks: z.string().trim().min(1).optional().nullable(),
  completedBy: z.string().trim().min(1).optional().nullable(),
  completedTimestamp: dateInput("Completed Timestamp").optional().nullable(),
  // Liquidated Damages (Oct 2026) — shape only; the completion/LD business
  // rules (when LD may be recorded, amount range and precision, immutability)
  // live in projectCompletion.rules.ts. ldRecordedByUserId/ldRecordedAt are
  // deliberately absent: the server sets them from the session.
  ldApplicable: z.boolean().optional(),
  ldAmountINR: z.number().optional().nullable(),
  ldRemarks: z.string().optional().nullable(),

  workOrderNumber: z.string().trim().min(1).optional(),
  workOrderDate: dateInput("Work Order Date").optional(),
  eicName: z.string().trim().min(1).optional(),
  contactNumber: z.string().trim().min(1).optional().nullable(),
  emailId: z.string().trim().email("Enter a valid email address.").optional().nullable(),

  estimatedDuration: z.coerce.number().int().positive().optional().nullable(),
  durationUnit: z.enum(["Days", "Weeks", "Months"]).optional().nullable(),

  contractType: z.string().trim().min(1).optional(),
  pmoCoordinator: z.string().trim().min(1).optional(),
  // See createProjectRequestSchema above.
  pmoCoordinatorEntryId: pmoCoordinatorEntryIdField,

  // No default here (unlike create) — omitting it on an update must leave
  // the existing value alone, not silently reset it to "Single".
  paymentType: z.enum(["Single", "Multiple"]).optional(),

  // No default here (unlike create) — omitting it on an update must leave
  // the existing value alone, not silently reset it to false.
  gstApplicable: z.boolean().optional(),

  // No default here either (unlike create) — omitting any of these on an
  // update must leave the existing value alone.
  currency: z.string().trim().min(1).optional(),
  currentExchangeRate: z.coerce.number().positive().optional(),
  contractExchangeRate: z.coerce.number().positive().optional(),

  // Expense Budget — Phase 3.5. Same 5 optional fields as createProjectSchema.
  manhourBudgetAmount: z.coerce.number().min(0, "Man-Hour Budget Amount cannot be negative.").optional().nullable(),
  manhourBudgetHours: z.coerce.number().min(0, "Man-Hour Budget Hours cannot be negative.").optional().nullable(),
  manhourBudgetRemarks: z.string().trim().optional().nullable(),
  nonManhourBudgetAmount: z.coerce
    .number()
    .min(0, "Non Man-Hour Budget Amount cannot be negative.")
    .optional()
    .nullable(),
  nonManhourBudgetRemarks: z.string().trim().optional().nullable(),

  // Project Leadership — Phase 3.7. Same 5 optional fields as createProjectSchema.
  primaryProjectManager: z.string().trim().optional().nullable(),
  secondaryProjectManager: z.string().trim().optional().nullable(),
  projectEngineer: z.string().trim().optional().nullable(),
  projectCoordinator: z.string().trim().optional().nullable(),
  clientCoordinator: z.string().trim().optional().nullable(),

  // Project Remarks — same field/limit as createProjectSchema.
  remarks: z.string().trim().max(1000, "Remarks cannot exceed 1000 characters.").optional().nullable(),
});

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

/**
 * GET /projects query params — parsed directly in the controller (the
 * shared `validate()` middleware only covers req.body), same error-shaping
 * convention as a body validation failure.
 */
export const listProjectsQuerySchema = z.object({
  search: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(10),
  sortField: z
    .enum(["prNo", "client", "projectTitle", "department", "projectStatus", "projectStartDate", "createdAt"])
    .default("prNo"),
  sortDirection: z.enum(["asc", "desc"]).default("asc"),
  projectStatus: z.string().trim().optional(),
  department: z.string().trim().optional(),
  client: z.string().trim().optional(),
  // region is an alias for prCategory (see schema.prisma's Project model
  // comment) — accepted as a separate query param so the frontend's
  // "Region" filter doesn't need to know it's the same underlying column.
  region: z.string().trim().optional(),
  prCategory: z.string().trim().optional(),
  // Defaults to undefined (repository treats that as false / active-only) —
  // pass true only for the Archived Projects list. z.coerce.boolean() is
  // deliberately NOT used here — it does a plain JS Boolean(value) cast, so
  // the literal query string "false" would coerce to true.
  isDeleted: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;

/**
 * POST /projects/import — bulk Excel import. Each row is validated by the
 * exact same createProjectSchema a single POST /projects uses — with ONE
 * deliberate exception: projectStatus/workOrderStatus are overridden back
 * to a permissive free-text string here. Real historical Excel data
 * predates the standardized dropdown vocabulary (createProjectSchema's
 * strict z.enum) and uses free-form phrasing that import must keep
 * accepting — see projectWorkbookService.ts's own comment on this exact
 * point ("Dropdown columns ... accept whatever value the file actually
 * has ... import just never rejects a row for using a value outside that
 * list"). Every other field stays identical to createProjectSchema, so a
 * row that would be accepted one at a time is still guaranteed to be
 * accepted here too for everything except these two intentionally-relaxed
 * fields.
 */
export const importProjectRowSchema = createProjectSchema.extend({
  workOrderStatus: z.string().trim().min(1, "Work Order Status is required."),
  projectStatus: z.string().trim().min(1, "Project Status is required."),
});

export const importProjectsSchema = z.object({
  projects: z.array(importProjectRowSchema).min(1, "At least one project is required."),
});

export type ImportProjectsInput = z.infer<typeof importProjectsSchema>;
