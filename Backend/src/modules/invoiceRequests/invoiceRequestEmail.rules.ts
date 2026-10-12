import { MANDATORY_INVOICE_WORKFLOW_CC_EMAIL } from "../../shared/email/email.constants.js";

/**
 * Pure trigger/composition rules for the Request Invoice -> Invoice Raised
 * -> Invoice Paid email lifecycle — no Prisma, no I/O, same convention as
 * projectCompletedTrigger.rules.ts / projectAssignedTrigger.rules.ts in the
 * Project Notification System.
 */

/**
 * The CC list every email in this lifecycle must carry: the mandatory
 * info@ifluids.com first, always present exactly once, followed by the
 * persisted CC Members' current email addresses — deduped case-insensitively
 * (defensive; @@unique([invoiceRequestId, portalUserId]) already prevents a
 * duplicate PortalUser row at persistence time, but two different accounts
 * could in principle share an email, or a member's address could happen to
 * equal the mandatory one). Caller-supplied order among the members is
 * otherwise preserved.
 */
export function buildInvoiceWorkflowCcList(memberEmails: readonly string[]): string[] {
  const mandatoryKey = MANDATORY_INVOICE_WORKFLOW_CC_EMAIL.trim().toLowerCase();
  const seen = new Set<string>([mandatoryKey]);
  const result = [MANDATORY_INVOICE_WORKFLOW_CC_EMAIL];

  for (const email of memberEmails) {
    const key = email.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(email);
  }

  return result;
}

/**
 * Invoice Paid — confirmed business rule: only a genuine previous-status-
 * !=-Paid -> Paid transition qualifies. Paid -> Paid (an unrelated edit that
 * leaves status untouched, or a re-save) must never fire again — see
 * invoice.service.ts's updateInvoiceLine() for the exact call site.
 */
export function isGenuinePaidTransition(previousStatus: string, newStatus: string): boolean {
  return previousStatus !== "Paid" && newStatus === "Paid";
}
