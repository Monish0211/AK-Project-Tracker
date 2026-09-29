/**
 * Fixed branding/copy shared by every template — one place to change the
 * company name or portal name everywhere it appears in an email.
 */
export const EMAIL_BRAND = {
  COMPANY_NAME: "iFluids Engineering",
  PORTAL_NAME: "PMO Portal",
} as const;

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
  PR_REQUEST_APPROVED: `Your PR Request has been approved — Project created`,
  PR_REQUEST_REJECTED: `Your PR Request has been rejected`,
} as const;
