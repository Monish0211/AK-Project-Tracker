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
  /** Project Notification System (Oct 2026) — optional CC list. Omit entirely for callers that don't need it. */
  cc?: string | string[];
  /** Request Invoice attachments (Oct 2026) — optional. Omitted by every other caller, whose behaviour is unchanged. */
  attachments?: EmailAttachment[];
}

/** A file read from disk at send time. `filename` is what the recipient sees; it must already be sanitized by the caller. */
export interface EmailAttachment {
  filename: string;
  /** Absolute path of the stored file — streamed by Nodemailer, never loaded into the HTTP request's memory. */
  path: string;
  contentType: string;
}

/**
 * How a failed send ended, so a caller can tell "definitely not delivered" from "we do not know":
 *  - not_configured: SMTP is not set up — nothing was sent.
 *  - size_rejected:  the mail server answered that the message is too large — definitely NOT delivered, safe to resend smaller.
 *  - rejected:       the server (or the connection attempt) definitively refused the message — NOT delivered.
 *  - unconfirmed:    no definitive answer (timeout / dropped connection) — the message MAY have been delivered. Never auto-retry.
 */
export type EmailFailureKind = "not_configured" | "size_rejected" | "rejected" | "unconfirmed";

export interface SendEmailResult {
  success: boolean;
  /** Present only when success is false — never thrown, so a failed email can never crash the request that triggered it. */
  error?: string;
  /** Present only when success is false. */
  failure?: EmailFailureKind;
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

/**
 * Request Invoice workflow (Sept 2026) — Section A: sent to the chosen
 * responsible person the moment a Request Invoice is submitted. Mirrors the
 * team's existing manual "raise the invoice" email template's field set —
 * client contact fields are read live from the Project (eicName/
 * contactNumber/emailId), the rest are free-text fields captured on the
 * request itself.
 */
export interface InvoiceRequestAttachmentLine {
  fileName: string;
  /** Already formatted, e.g. "2.4 MB". */
  sizeLabel: string;
  /** Optional short tag shown after the name, e.g. "Email conversation". Plain text — escaped by the template. */
  kindLabel?: string;
}

export interface InvoiceRequestAssignedEmailData {
  assignedToName: string;
  requesterName: string;
  prNo: string;
  projectTitle: string;
  client: string;
  clientContactName: string | null;
  clientContactPhone: string | null;
  clientContactEmail: string | null;
  invoiceAmountNote: string | null;
  copiesRequired: string | null;
  drawingsAvailable: string | null;
  printingDetails: string | null;
  address: string | null;
  notes: string | null;
  invoicesUrl: string;
  /**
   * Files uploaded with the request (Oct 2026). `attached` = they ride on THIS email. `not_attached` = they were uploaded and
   * are retained, but could NOT be attached to this email — the email says so plainly and never claims they were received.
   * Omitted entirely when the request had no files (the email is then exactly what it was before).
   */
  attachments?: { mode: "attached" | "not_attached"; files: InvoiceRequestAttachmentLine[]; notAttachedReason?: string };
}

/** Request Invoice workflow (Sept 2026) — Section B: sent to the original requester automatically, only after the invoice has actually, successfully been raised. */
export interface InvoiceRaisedSuccessfullyEmailData {
  requesterName: string;
  prNo: string;
  projectTitle: string;
  invoicesUrl: string;
}

/**
 * Request Invoice workflow — Invoice Paid (Oct 2026). Sent to the original
 * requester, only on a genuine previous-status-!=-Paid -> Paid transition
 * (see invoice.service.ts's updateInvoiceLine()), only when that InvoiceLine
 * is the one that fulfilled an InvoiceRequest. invoiceAmountINR is the raw
 * number — formatting happens in the template, matching every other
 * currency field across these email data interfaces.
 */
export interface InvoicePaidEmailData {
  requesterName: string;
  prNo: string;
  projectTitle: string;
  client: string;
  invoiceNo: string;
  invoiceAmountINR: number;
  /** Invoice Currency feature (Oct 2026) — optional; absent/INR renders exactly as before. See templates/invoiceAmount.format.ts. */
  invoiceCurrency?: string | undefined;
  invoiceAmountOriginal?: number | null | undefined;
  exchangeRateToINR?: number | undefined;
  invoicesUrl: string;
}

/**
 * Request Invoice workflow (Sept 2026) — Section C: "Send Invoice To," a
 * separate MANUAL action the responsible person takes after an invoice has
 * already, successfully been saved — never sent before that save succeeds,
 * and always reflects the actual saved invoice data (never a preview/draft
 * figure).
 */
export interface InvoiceSharedEmailData {
  recipientName: string;
  sharedByName: string;
  prNo: string;
  projectTitle: string;
  client: string;
  invoiceNo: string;
  invoiceAmountINR: number;
  /** Invoice Currency feature (Oct 2026) — optional; absent/INR renders exactly as before. See templates/invoiceAmount.format.ts. */
  invoiceCurrency?: string | undefined;
  invoiceAmountOriginal?: number | null | undefined;
  exchangeRateToINR?: number | undefined;
  invoiceDateIso: string;
  invoicesUrl: string;
}


/** PMO Coordinator Management (Oct 2026) — the allocation email to a newly assigned coordinator. */
export interface PmoCoordinatorAllocatedEmailData {
  /** The linked PMO Portal account's name (null if it has none). */
  coordinatorName: string | null;
  prNo: string;
  projectTitle: string;
  client: string | null;
  projectUrl: string;
}
