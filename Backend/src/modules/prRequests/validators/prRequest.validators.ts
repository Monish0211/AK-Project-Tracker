import { z } from "zod";
import { createProjectSchema } from "../../projects/validators/project.validators.js";
import { createQuantitySchema } from "../../quantity/validators/quantity.validators.js";
import { createMilestoneSchema } from "../../milestones/validators/milestone.validators.js";

/**
 * A Draft PR Request's payload — the EXACT SAME Zod schema (createProjectSchema,
 * re-exported unchanged, never copied) a normal POST /projects's General
 * Information tab uses, PLUS optional quantityItems[]/paymentMilestones[]
 * arrays reusing THOSE modules' own create schemas unchanged too. A PR
 * Request can therefore never be accepted here with data any of the three
 * real creation endpoints (Project/Quantity/Milestone) would have rejected,
 * and all four can never silently drift apart. Both arrays are optional
 * (default []) — matching Add Project's own real behavior, where a brand
 * new Project can be saved before Quantity/Payments are ever filled in; see
 * prRequest.service.ts's pmoManagerApprove() for how these replay onto real
 * QuantityItem/PaymentMilestone rows once a real Project exists.
 */
export const prRequestProjectDataSchema = createProjectSchema.extend({
  // PMO Coordinator Management (Oct 2026) — the registry entry picked in the
  // form. Stored with the draft; on approval createProject() validates it and
  // links that coordinator's account (no entry = coordinator text only).
  pmoCoordinatorEntryId: z.string().trim().min(1, "PMO Coordinator selection is invalid.").optional(),
  quantityItems: z.array(createQuantitySchema).default([]),
  paymentMilestones: z.array(createMilestoneSchema).default([]),
});
export type PRRequestProjectDataInput = z.infer<typeof prRequestProjectDataSchema>;

/**
 * Save/update a Draft — no assignedPmoManagerId here at all (see
 * schema.prisma's PRRequest.assignedPmoManagerId comment: that's chosen at
 * Send to Accounts time, a separate action outside this form, never a field
 * inside it).
 */
export const saveDraftPRRequestSchema = z.object({
  projectData: prRequestProjectDataSchema,
});
export type SaveDraftPRRequestInput = z.infer<typeof saveDraftPRRequestSchema>;

/**
 * Send to Accounts — the actual submission action. This is where the
 * requester picks BOTH the Assigned Accounts Approver and the Assigned PMO
 * Manager, and where the approval chain (and the Accounts approver's
 * notification) actually begins. Neither is restricted to a particular
 * role — any active PortalUser may be picked for either (confirmed business
 * decision for the Accounts side; PMO Manager was always role-restricted to
 * "PMO Manager" — see prRequest.service.ts's sendToAccounts()).
 */
export const sendToAccountsSchema = z.object({
  assignedAccountsApproverId: z.string().trim().min(1, "Assigned Accounts Approver is required."),
  assignedPmoManagerId: z.string().trim().min(1, "Assigned PMO Manager is required."),
});
export type SendToAccountsInput = z.infer<typeof sendToAccountsSchema>;

export const rejectPRRequestSchema = z.object({
  reason: z.string().trim().min(1, "A rejection reason is required.").max(1000, "Reason cannot exceed 1000 characters."),
});
export type RejectPRRequestInput = z.infer<typeof rejectPRRequestSchema>;

export const approveRemarksSchema = z.object({
  remarks: z.string().trim().max(1000, "Remarks cannot exceed 1000 characters.").optional().nullable(),
});
export type ApproveRemarksInput = z.infer<typeof approveRemarksSchema>;

export const prRequestIdParamSchema = z.object({
  id: z.string().trim().min(1, "PR Request ID is required."),
});
