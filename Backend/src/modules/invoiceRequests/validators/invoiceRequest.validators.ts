import { z } from "zod";
import { uuidParamSchema } from "../../../shared/utils/uuidParam.js";

/**
 * Request Invoice — Section A. `assignedToUserId` is the "responsible
 * person" chosen from the eligibility-filtered GET /users/eligible-invoice-
 * raisers lookup (active + holds "Raise Invoice") — re-validated server-side
 * in invoiceRequest.service.ts's createInvoiceRequest(), never trusted from
 * the frontend's own filtered dropdown alone. Client Name/Project Name/PR
 * Number are deliberately NOT accepted here — always read live from the
 * linked Project (see invoiceRequest.repository.ts).
 */
export const createInvoiceRequestSchema = z.object({
  assignedToUserId: z.string().trim().min(1, "Please select who should raise this invoice."),
  // CC Members (Oct 2026) — optional, any number of PortalUser ids. Never
  // trusted as-is: invoiceRequest.service.ts's createInvoiceRequest()
  // re-validates every id is a real, active PortalUser before persisting,
  // and dedupes. The mandatory info@ifluids.com recipient is never accepted
  // here — it is server-injected wherever this workflow's emails are
  // composed (see invoiceRequestEmail.rules.ts), so the frontend has no way
  // to omit or duplicate it.
  ccMemberUserIds: z.array(z.string().trim().min(1)).optional(),
  // Matches the team's existing manual "raise the invoice" email template —
  // all free text, all optional (a request must not be blocked on filling
  // these in if the requester doesn't have the detail handy yet).
  invoiceAmountNote: z.string().trim().max(500).optional().nullable(),
  copiesRequired: z.string().trim().max(200).optional().nullable(),
  drawingsAvailable: z.string().trim().max(500).optional().nullable(),
  printingDetails: z.string().trim().max(500).optional().nullable(),
  address: z.string().trim().max(1000).optional().nullable(),
  notes: z.string().trim().max(1000, "Notes cannot exceed 1000 characters.").optional().nullable(),
});
export type CreateInvoiceRequestInput = z.infer<typeof createInvoiceRequestSchema>;

export const projectIdParamSchema = uuidParamSchema("projectId", "Project ID");
export type ProjectIdParam = z.infer<typeof projectIdParamSchema>;
