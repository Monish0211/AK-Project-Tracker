import { z } from "zod";
import { uuidParamSchema } from "../../../shared/utils/uuidParam.js";
import { MAX_ADDITIONAL_CC_EMAILS, normalizeAdditionalCcEmails } from "../invoiceRequestEmail.rules.js";

/** An address in an error message: control characters removed and shortened, so a rejected value can never carry a line break into a message. */
const forMessage = (value: string): string => value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 80);

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
  // and dedupes. The mandatory recipients (arun@ifluids.com, and accounts@ifluids.com
  // on Assigned / Raised) are never accepted here — they are server-injected wherever this workflow's emails are
  // composed (see invoiceRequestEmail.rules.ts), so the frontend has no way
  // to omit or duplicate them.
  ccMemberUserIds: z.array(z.string().trim().min(1)).optional(),
  // Additional CC Email Addresses (Oct 2026) — free-typed addresses, for people outside the PMO user list. Validated HERE, on the server,
  // whatever the browser did: each must be one plain valid address; the result is trimmed, lower-cased and de-duplicated. They are added to
  // the notification email's CC and can never replace the mandatory recipients or the CC Members (see buildInvoiceWorkflowCcList).
  additionalCcEmails: z
    .array(z.string().max(320, "An email address is too long."))
    .max(MAX_ADDITIONAL_CC_EMAILS, `You can add at most ${MAX_ADDITIONAL_CC_EMAILS} additional CC email addresses.`)
    .refine((list) => normalizeAdditionalCcEmails(list).invalid.length === 0, {
      error: (issue) => {
        const bad = normalizeAdditionalCcEmails(issue.input as string[]).invalid[0] ?? "";
        return `"${forMessage(bad)}" is not a valid email address.`;
      },
    })
    .transform((list) => normalizeAdditionalCcEmails(list).emails)
    .optional(),
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
