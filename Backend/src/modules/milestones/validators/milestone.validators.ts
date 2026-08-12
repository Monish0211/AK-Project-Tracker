import { z } from "zod";

/**
 * Required fields mirror validatePaymentMilestonesTab() in
 * frontend/src/utils/projectValidation.ts exactly (milestoneName non-empty,
 * paymentPercentage > 0) — the frontend already blocks Save/Save & Next
 * until these pass client-side. `amount` is deliberately NOT accepted here
 * — milestone.service.ts derives it from paymentPercentage and the
 * project's Work Order Value, so the backend is never trusted to store a
 * client-computed value that could drift from Quantity.
 */
export const createMilestoneSchema = z.object({
  milestoneName: z.string().trim().min(1, "Milestone Name is required."),
  paymentPercentage: z.coerce.number().positive("Payment % must be greater than 0."),
  dueDate: z.coerce.date().optional().nullable(),
});

export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;

/** Same fields as createMilestoneSchema, all optional — a PATCH only carries what changed. */
export const updateMilestoneSchema = z.object({
  milestoneName: z.string().trim().min(1).optional(),
  paymentPercentage: z.coerce.number().positive("Payment % must be greater than 0.").optional(),
  dueDate: z.coerce.date().optional().nullable(),
});

export type UpdateMilestoneInput = z.infer<typeof updateMilestoneSchema>;

/**
 * POST /projects/:projectId/milestones/ingest — the ONLY path that accepts
 * a client-supplied `id`, and only because these rows already exist (legacy
 * localStorage projects being opened in Edit for the first time after this
 * migration, or a future Excel Import's Milestones sheet) and are already
 * referenced elsewhere by that exact id (InvoiceLine.milestoneId). Reuses
 * the exact same per-field rules as createMilestoneSchema — matching
 * importProjectsSchema's precedent of reusing createProjectSchema per row
 * (Phase 3.2) — so a row that would be accepted one at a time is guaranteed
 * to be accepted here too. Shape validation only — milestone.service.ts's
 * ingestMilestonesForProject() is where an id that already exists gets
 * classified as an identical-retry no-op vs. a rejected same-id/different-
 * data conflict, and where a concurrent ingest race is resolved rather than
 * surfaced as a raw error. See docs/PMO_PORTAL_TECHNICAL_DOCUMENTATION.md's
 * Payment Milestone ID Stability Strategy for why this is a separate
 * endpoint rather than an optional `id` field on the schema above.
 */
export const ingestMilestonesSchema = z.object({
  milestones: z
    .array(
      z.object({
        id: z.string().trim().uuid("Milestone ID must be a valid UUID."),
        milestoneName: z.string().trim().min(1, "Milestone Name is required."),
        paymentPercentage: z.coerce.number().positive("Payment % must be greater than 0."),
        dueDate: z.coerce.date().optional().nullable(),
      })
    )
    .min(1, "At least one milestone is required."),
});

export type IngestMilestonesInput = z.infer<typeof ingestMilestonesSchema>;

/**
 * Path-param validation for routes keyed by :projectId / :id — the shared
 * `validate()` middleware only covers req.body (same manual-safeParse
 * convention as quantity.validators.ts's param schemas).
 */
export const projectIdParamSchema = z.object({
  projectId: z.string().trim().min(1, "Project ID is required."),
});

export type ProjectIdParam = z.infer<typeof projectIdParamSchema>;

export const milestoneIdParamSchema = z.object({
  id: z.string().trim().min(1, "Milestone ID is required."),
});

export type MilestoneIdParam = z.infer<typeof milestoneIdParamSchema>;
