import { z } from "zod";
import { prRequestProjectDataSchema } from "./prRequest.validators.js";

/** Administrative Controls - every administrative action needs a reason (kept in the approval history and the audit log). */
const reason = z.string().trim().min(5, "A reason of at least 5 characters is required.").max(1000, "Reason cannot exceed 1000 characters.");

export const adminReasonSchema = z.object({ reason });
export type AdminReasonInput = z.infer<typeof adminReasonSchema>;

export const adminEditPRRequestSchema = z.object({ projectData: prRequestProjectDataSchema, reason });
export type AdminEditPRRequestInput = z.infer<typeof adminEditPRRequestSchema>;

export const adminReassignSchema = z
  .object({
    assignedAccountsApproverId: z.string().trim().min(1).optional(),
    assignedPmoManagerId: z.string().trim().min(1).optional(),
    reason,
  })
  .refine((v) => !!v.assignedAccountsApproverId || !!v.assignedPmoManagerId, { message: "Choose the approver to reassign." });
export type AdminReassignInput = z.infer<typeof adminReassignSchema>;

const STATUSES = ["Draft", "Pending Accounts Approval", "Pending PMO Manager Approval", "Approved", "Rejected", "Deleted"] as const;
export const adminListPRRequestsQuerySchema = z.object({
  status: z.enum(STATUSES).optional(),
  prCategory: z.string().trim().min(1).optional(),
  approverId: z.string().trim().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type AdminListPRRequestsQuery = z.infer<typeof adminListPRRequestsQuerySchema>;
