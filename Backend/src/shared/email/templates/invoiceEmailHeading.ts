import { escapeHtml } from "./missingOtherExpenses.template.js";

/**
 * The project line of the Request Invoice emails (Oct 2026). It is BOTH the email's subject and the heading at the top of its body, built here from
 * the same values so the two can never drift apart:
 *   Invoice request            - {Client Name} - {Project Title} - {PR Number}      (the "Invoice Request Assigned" email)
 *   Invoice has been raised    - {Client Name} - {Project Title} - {PR Number}      (the "Invoice Raised" email)
 *   Invoice Paid               - {Client Name} - {Project Title} - {PR Number}      (the "Invoice Paid" email)
 * (The two PR Request outcome emails use the same mechanism with the FULL client and title and no PR number — see the end of this file.)
 * Client name and project title are cut to their FIRST THREE WORDS here, for the subject/heading only — the full values still appear in the details table
 * below the heading and are stored unchanged on the Project. The PR number is always shown complete, last, without a label.
 */

export const INVOICE_REQUEST_HEADING_PREFIX = "Invoice request";
export const INVOICE_RAISED_HEADING_PREFIX = "Invoice has been raised";

/** How many words of the client name / project title the heading shows. */
export const HEADING_MAX_WORDS = 3;

/**
 * A segment of at most this many characters is kept on one line in the HTML heading — its spaces are non-breaking (which Outlook's Word engine honours) and it
 * is wrapped in white-space:nowrap (which also stops a break after a hyphen inside it, e.g. "PR-12073-" / "REV2") — so a wrapped heading breaks between the
 * " - " separated parts and never inside a client name, title or PR number ("3D F&G" / "Mapping"). About 36 characters is what fits on one line of the 520px card
 * at 16px bold. Longer segments keep ordinary spaces: a very long name must still be able to wrap instead of being clipped by the email card.
 */
const KEEP_TOGETHER_MAX_CHARS = 36;

/**
 * Whitespace-separated words of any value (null, undefined or non-text become none): runs of spaces, tabs, line breaks and no-break spaces all count as one
 * gap, and control characters (which have no place in a subject line) are treated as gaps too.
 */
function wordsOf(value: unknown): string[] {
  return typeof value === "string" ? value.replace(/[\u0000-\u001F\u007F-\u009F]/g, " ").split(/\s+/).filter((word) => word.length > 0) : [];
}

/** The first `maxWords` words of `value`, single-spaced; "" when there are none. */
export function firstWords(value: unknown, maxWords: number = HEADING_MAX_WORDS): string {
  return wordsOf(value).slice(0, maxWords).join(" ");
}

export interface InvoiceEmailHeadingValues {
  client?: string | null;
  projectTitle?: string | null;
  prNo?: string | null;
}

/** The parts of the line, prefix first. A part that is missing or blank is left out, so there is never a dangling or doubled separator or an "undefined". */
function headingSegments(prefix: string, { client, projectTitle, prNo }: InvoiceEmailHeadingValues): string[] {
  const parts = [firstWords(client), firstWords(projectTitle), wordsOf(prNo).join(" ")].filter((part) => part !== "");
  return [prefix, ...parts];
}

/**
 * The plain-text line — used verbatim as the email SUBJECT (plain text: "&" stays "&", nothing is HTML-escaped; it is a single line by construction because
 * every run of whitespace and every control character was collapsed to one space).
 */
export function buildInvoiceEmailHeading(prefix: string, values: InvoiceEmailHeadingValues): string {
  return headingSegments(prefix, values).join(" - ");
}

/** Subject of the "Invoice Request Assigned" (Request Invoice) email — the same text as its body heading. */
export function buildInvoiceRequestSubject(values: InvoiceEmailHeadingValues): string {
  return buildInvoiceEmailHeading(INVOICE_REQUEST_HEADING_PREFIX, values);
}

/** Subject of the "Invoice Raised" email — the same text as its body heading. */
export function buildInvoiceRaisedSubject(values: InvoiceEmailHeadingValues): string {
  return buildInvoiceEmailHeading(INVOICE_RAISED_HEADING_PREFIX, values);
}

export const INVOICE_PAID_HEADING_PREFIX = "Invoice Paid";

/**
 * Subject of the "Invoice Paid" email — the same text as its body heading, in the same format as the Request / Raised emails:
 * "Invoice Paid - {client, first 3 words} - {project title, first 3 words} - {full PR number}".
 */
export function buildInvoicePaidSubject(values: InvoiceEmailHeadingValues): string {
  return buildInvoiceEmailHeading(INVOICE_PAID_HEADING_PREFIX, values);
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// PR Request approved / rejected (Oct 2026): the subject and the body heading carry the FULL client name and the FULL project title (no three-word cut) and
// deliberately NO PR number:
//   Your PR Request has been approved — Project created - {Client Name} - {Project Title}
//   Your PR Request has been rejected - {Client Name} - {Project Title}
// ---------------------------------------------------------------------------------------------------------------------------------------------

export const PR_REQUEST_APPROVED_HEADING_PREFIX = "Your PR Request has been approved — Project created";
export const PR_REQUEST_REJECTED_HEADING_PREFIX = "Your PR Request has been rejected";

export interface ProjectLineValues {
  client?: string | null;
  projectTitle?: string | null;
}

/** Prefix, then the whole client name and the whole project title — each only whitespace-normalised (runs of spaces, line breaks, control characters -> one space). A blank part is left out. */
function projectLineSegments(prefix: string, { client, projectTitle }: ProjectLineValues): string[] {
  const parts = [wordsOf(client).join(" "), wordsOf(projectTitle).join(" ")].filter((part) => part !== "");
  return [prefix, ...parts];
}

/** Subject of the "PR Request approved" email — the same text as its body heading. */
export function buildPRRequestApprovedSubject(values: ProjectLineValues): string {
  return projectLineSegments(PR_REQUEST_APPROVED_HEADING_PREFIX, values).join(" - ");
}

/** Subject of the "PR Request rejected" email — the same text as its body heading. */
export function buildPRRequestRejectedSubject(values: ProjectLineValues): string {
  return projectLineSegments(PR_REQUEST_REJECTED_HEADING_PREFIX, values).join(" - ");
}

/** Body heading of the "PR Request approved" email (same wrapping rules as the invoice emails). */
export function renderPRRequestApprovedHeading(values: ProjectLineValues): string {
  return renderHeadingSegments(projectLineSegments(PR_REQUEST_APPROVED_HEADING_PREFIX, values));
}

/** Body heading of the "PR Request rejected" email (same wrapping rules as the invoice emails). */
export function renderPRRequestRejectedHeading(values: ProjectLineValues): string {
  return renderHeadingSegments(projectLineSegments(PR_REQUEST_REJECTED_HEADING_PREFIX, values));
}

/**
 * The heading as email markup: the SAME text as the subject (tags aside), with every segment HTML-escaped exactly once (these are user-entered values). The
 * separator hyphen is glued to the segment before it and short segments are kept whole (see KEEP_TOGETHER_MAX_CHARS), so when the heading is longer than one
 * line (it usually is) it wraps only after a " -", never inside a name or PR number and never with a line starting with "-". Inline styles, like the rest of
 * the email; 16px so a typical heading takes two lines at most in the 520px card.
 */
function renderHeadingSegments(segments: string[]): string {
  const units = segments.map((segment, index) => {
    const escaped = escapeHtml(segment);
    const separator = index < segments.length - 1 ? "&nbsp;-" : "";
    return segment.length <= KEEP_TOGETHER_MAX_CHARS ? `<span style="white-space:nowrap;">${escaped.replace(/ /g, "&nbsp;")}${separator}</span>` : `${escaped}${separator}`;
  });
  return `<h2 style="margin:0 0 20px; font-size:16px; line-height:1.4; font-weight:700; color:#0F172A; overflow-wrap:anywhere;">${units.join(" ")}</h2>`;
}

/** The heading of the Invoice Request / Raised / Paid emails (first three words of client and title, full PR number) as markup. */
export function renderInvoiceEmailHeading(prefix: string, values: InvoiceEmailHeadingValues): string {
  return renderHeadingSegments(headingSegments(prefix, values));
}
