/**
 * The generic contract every call into email.service.ts's sendEmail() uses,
 * regardless of which module or template produced the HTML — kept
 * independent of Nodemailer's own types so nothing outside transporter.ts
 * needs to know Nodemailer exists.
 */
export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  /** Plain-text fallback for clients that don't render HTML. Optional — most callers can skip it. */
  text?: string;
}

export interface SendEmailResult {
  success: boolean;
  /** Present only when success is false — never thrown, so a failed email can never crash the request that triggered it. */
  error?: string;
}

/** What every template function returns — the service layer never builds subject lines or HTML itself. */
export interface EmailContent {
  subject: string;
  html: string;
}

export interface WelcomeEmailData {
  fullName: string;
  loginUrl: string;
}

export interface AccountCreatedEmailData {
  fullName: string;
  email: string;
  temporaryPassword: string;
  roleName: string;
  loginUrl: string;
}

export interface ForgotPasswordEmailData {
  fullName: string;
  resetUrl: string;
  expiresInMinutes: number;
}

export interface ResetSuccessEmailData {
  fullName: string;
  changedAtIso: string;
}

/**
 * Distinct from ResetSuccessEmailData on purpose — that one is a passive
 * security notice for a password the account holder changed themselves
 * (self-service or forgot-password). This is for a password an
 * Administrator changed on the user's behalf, so the copy and the
 * temporary-password/login-button content are both entirely different.
 */
export interface AdminPasswordResetEmailData {
  fullName: string;
  email: string;
  temporaryPassword: string;
  roleName: string;
  loginUrl: string;
}

/** PR Request & Two-Level Approval Workflow — one interface per notification-worthy stage transition. Never includes internal ids beyond what the review link needs. */
export interface PRRequestSubmittedEmailData {
  accountsApproverName: string;
  requesterName: string;
  prNo: string;
  projectTitle: string;
  client: string;
  reviewUrl: string;
}

export interface PRRequestAccountsApprovedEmailData {
  pmoManagerName: string;
  requesterName: string;
  prNo: string;
  projectTitle: string;
  reviewUrl: string;
}

export interface PRRequestApprovedEmailData {
  requesterName: string;
  prNo: string;
  projectTitle: string;
  projectUrl: string;
}

export interface PRRequestRejectedEmailData {
  requesterName: string;
  prNo: string;
  projectTitle: string;
  rejectedByName: string;
  reason: string;
}
