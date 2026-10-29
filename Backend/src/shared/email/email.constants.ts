/**
 * Fixed branding/copy shared by every template — one place to change the
 * company name or portal name everywhere it appears in an email.
 */
export const EMAIL_BRAND = {
  COMPANY_NAME: "iFluids Engineering",
  PORTAL_NAME: "PMO Portal",
} as const;

/**
 * Request Invoice → Invoice Raised → Invoice Paid workflow (Oct 2026) — EVERY email in that lifecycle ("Invoice Request Assigned", "Invoice Raised"
 * and "Invoice Paid") carries the same two mandatory CC recipients, server-controlled and never user-removable. They are not PortalUsers (no
 * directory row backs them), so they are injected here rather than persisted as CC Members — see invoiceRequestEmail.rules.ts.
 * (The Paid email's mandatory address was info@ifluids.com until Oct 2026; info@ifluids.com is still used by the unrelated weekly emails.)
 */
export const MANDATORY_INVOICE_REQUEST_CC_EMAIL = "arun@ifluids.com";

/** The Accounts mailbox — the second mandatory CC of every email in the Request Invoice lifecycle. */
export const MANDATORY_INVOICE_ACCOUNTS_CC_EMAIL = "accounts@ifluids.com";

/** Every mandatory CC of the three lifecycle emails, in the order they are listed (each exactly once). */
export const MANDATORY_INVOICE_WORKFLOW_CC_EMAILS = [MANDATORY_INVOICE_REQUEST_CC_EMAIL, MANDATORY_INVOICE_ACCOUNTS_CC_EMAIL] as const;

/**
 * One subject line per template, kept here rather than inline in each
 * template file so a future notification-log/audit feature can list "what
 * subject lines does this system send" without importing every template.
 */
export const EMAIL_SUBJECTS = {
  WELCOME: `Welcome to the ${EMAIL_BRAND.COMPANY_NAME} ${EMAIL_BRAND.PORTAL_NAME}`,
  ACCOUNT_CREATED: `Your ${EMAIL_BRAND.PORTAL_NAME} account has been created`,
  FORGOT_PASSWORD: `Reset your ${EMAIL_BRAND.PORTAL_NAME} password`,
  RESET_SUCCESS: `Your ${EMAIL_BRAND.PORTAL_NAME} password has been changed`,
  ADMIN_PASSWORD_RESET: `Your ${EMAIL_BRAND.PORTAL_NAME} password has been reset by an Administrator`,
  PR_REQUEST_SUBMITTED: `New PR Request awaiting Accounts approval`,
  PR_REQUEST_ACCOUNTS_APPROVED: `PR Request awaiting your approval`,
  // The "PR Request approved" / "PR Request rejected" subjects are built per request (full client name + full project title, no PR number), exactly like
  // their body heading — see templates/invoiceEmailHeading.ts (buildPRRequestApprovedSubject / buildPRRequestRejectedSubject).
  // The "Invoice Request Assigned" and "Invoice Raised" subjects are built per project (first three words of client and title + the PR number), exactly like
  // their body heading — see templates/invoiceEmailHeading.ts (buildInvoiceRequestSubject / buildInvoiceRaisedSubject).
  INVOICE_SHARED: `An invoice has been shared with you`,
  // PMO Coordinator Management (Oct 2026) — the allocation email.
  PMO_COORDINATOR_ALLOCATED: (prNo: string) => `PMO Project Assigned to You — ${prNo}`,
  // The "Invoice Paid" subject is built per project (first three words of client and title + the PR number), exactly like its body heading and like the
  // Invoice Request / Invoice Raised subjects — see templates/invoiceEmailHeading.ts (buildInvoicePaidSubject).
} as const;
