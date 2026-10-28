import { escapeHtml } from "./missingOtherExpenses.template.js";

/**
 * The heading line at the top of the two Request Invoice emails (Oct 2026):
 *   Invoice request            - {Client Name} - {Project Title} - {PR Number}      (the "Invoice Request Assigned" email)
 *   Invoice has been raised    - {Client Name} - {Project Title} - {PR Number}      (the "Invoice Raised" email)
 * Client name and project title are cut to their FIRST THREE WORDS here, for the heading only — the full values still appear in the details table
 * below it and are stored unchanged on the Project. The PR number is always shown complete, last, without a label.
 */

export const INVOICE_REQUEST_HEADING_PREFIX = "Invoice request";
export const INVOICE_RAISED_HEADING_PREFIX = "Invoice has been raised";

/** How many words of the client name / project title the heading shows. */
export const HEADING_MAX_WORDS = 3;

/** Whitespace-separated words of any value (null, undefined or non-text become none): runs of spaces, tabs, line breaks and no-break spaces all count as one gap. */
function wordsOf(value: unknown): string[] {
  return typeof value === "string" ? value.split(/\s+/).filter((word) => word.length > 0) : [];
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

/**
 * The plain-text heading. A part that is missing or blank is left out together with its " - " separator, so there is never a dangling or doubled
 * separator, and nothing like "undefined" or "null" can appear.
 */
export function buildInvoiceEmailHeading(prefix: string, { client, projectTitle, prNo }: InvoiceEmailHeadingValues): string {
  const parts = [firstWords(client), firstWords(projectTitle), wordsOf(prNo).join(" ")].filter((part) => part !== "");
  return [prefix, ...parts].join(" - ");
}

/** The heading as email markup. The whole string is HTML-escaped exactly once (these are user-entered values); the style is inline, like the rest of the email. */
export function renderInvoiceEmailHeading(prefix: string, values: InvoiceEmailHeadingValues): string {
  return `<h2 style="margin:0 0 20px; font-size:18px; line-height:1.4; font-weight:700; color:#0F172A;">${escapeHtml(buildInvoiceEmailHeading(prefix, values))}</h2>`;
}
