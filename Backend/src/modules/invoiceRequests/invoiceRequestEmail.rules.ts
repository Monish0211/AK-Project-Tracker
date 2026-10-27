import { MANDATORY_INVOICE_REQUEST_CC_EMAIL, MANDATORY_INVOICE_WORKFLOW_CC_EMAIL } from "../../shared/email/email.constants.js";

/**
 * Pure trigger/composition rules for the Request Invoice -> Invoice Raised
 * -> Invoice Paid email lifecycle — no Prisma, no I/O, same convention as
 * projectCompletedTrigger.rules.ts / projectAssignedTrigger.rules.ts in the
 * Project Notification System.
 */

/**
 * The CC list an email in this lifecycle must carry: the stage's mandatory address first, always present exactly once, followed by the
 * persisted CC Members' current email addresses — deduped case-insensitively
 * (defensive; @@unique([invoiceRequestId, portalUserId]) already prevents a
 * duplicate PortalUser row at persistence time, but two different accounts
 * could in principle share an email, or a member's address could happen to
 * equal the mandatory one). Caller-supplied order among the members is
 * otherwise preserved.
 *
 * `mandatoryEmail` defaults to MANDATORY_INVOICE_WORKFLOW_CC_EMAIL (info@ifluids.com), which is what the Invoice Paid email uses; the
 * Assigned and Raised emails go through buildInvoiceRequestCcList() below instead.
 */
export function buildInvoiceWorkflowCcList(
  memberEmails: readonly string[],
  additionalEmails: readonly string[] = [],
  skipAdditional: readonly string[] = [],
  mandatoryEmail: string = MANDATORY_INVOICE_WORKFLOW_CC_EMAIL
): string[] {
  const mandatoryKey = mandatoryEmail.trim().toLowerCase();
  const seen = new Set<string>([mandatoryKey]);
  const result = [mandatoryEmail];

  for (const email of memberEmails) {
    const key = email.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(email);
  }

  // Manually entered addresses (Oct 2026) come last. They can only ADD: the mandatory address and the members are already in the list,
  // and a duplicate of either — or of a `skipAdditional` address such as the primary recipient — is dropped, whatever its letter case.
  const skip = new Set(skipAdditional.map((e) => e.trim().toLowerCase()));
  for (const email of additionalEmails) {
    const key = email.trim().toLowerCase();
    if (!key || seen.has(key) || skip.has(key)) continue;
    seen.add(key);
    result.push(email);
  }

  return result;
}

/**
 * CC list of the "Invoice Request Assigned" and "Invoice Raised" emails: identical rules to buildInvoiceWorkflowCcList (mandatory address
 * first and exactly once, then the CC Members, then manual addresses, case-insensitive de-duplication, the primary recipient never repeated),
 * but the mandatory address is MANDATORY_INVOICE_REQUEST_CC_EMAIL (arun@ifluids.com). The Invoice Paid email keeps using
 * buildInvoiceWorkflowCcList with its default (info@ifluids.com).
 */
export function buildInvoiceRequestCcList(memberEmails: readonly string[], additionalEmails: readonly string[] = [], skipAdditional: readonly string[] = []): string[] {
  return buildInvoiceWorkflowCcList(memberEmails, additionalEmails, skipAdditional, MANDATORY_INVOICE_REQUEST_CC_EMAIL);
}

/** The most manually entered CC addresses one request may carry. */
export const MAX_ADDITIONAL_CC_EMAILS = 10;

// A practical subset of RFC 5322 for a plain address: dot-atom local part, a dotted domain of letters / digits / hyphens. No spaces, quotes,
// angle brackets, display names, comments, IP-literal domains or line breaks — so nothing in an accepted address can alter the email's headers.
const EMAIL_ADDRESS = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

/** The address trimmed and lower-cased, or null when it is not one plain, valid email address. */
export function normalizeEmailAddress(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length === 0 || email.length > 254 || !EMAIL_ADDRESS.test(email)) return null;
  const at = email.lastIndexOf("@");
  const local = email.slice(0, at);
  if (local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return null;
  const tld = email.slice(email.lastIndexOf(".") + 1);
  if (!/^[a-z]{2,63}$/.test(tld) && !/^xn--[a-z0-9-]{1,59}$/.test(tld)) return null;
  return email;
}

/**
 * Checks every entered address independently of the browser: blanks are ignored, each address is trimmed and lower-cased, duplicates (any
 * letter case) are collapsed keeping the first, and anything that is not one plain valid address is reported in `invalid`.
 */
export function normalizeAdditionalCcEmails(raw: readonly string[]): { emails: string[]; invalid: string[] } {
  const emails: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (entry.trim().length === 0) continue;
    const email = normalizeEmailAddress(entry);
    if (!email) {
      invalid.push(entry);
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  return { emails, invalid };
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
