import type { EmailContent, InvoiceRaisedSuccessfullyEmailData } from "../email.types.js";
import { INVOICE_RAISED_HEADING_PREFIX, buildInvoiceRaisedSubject, renderInvoiceEmailHeading } from "./invoiceEmailHeading.js";
import { renderButton, renderEmailLayout } from "./layout.template.js";
import { escapeHtml } from "./missingOtherExpenses.template.js";

/**
 * Client Name row — between PR Number and Project Title. The value is the Project's own client (user-entered, so HTML-escaped like every
 * other user-entered value in the newer templates). When it is missing or blank the row is left out entirely (same "skip if empty"
 * convention as invoiceRequestAssigned.template.ts) so the table never shows an empty cell; the other two rows are unaffected.
 */
function clientRow(client: string | null | undefined): string {
  const value = client?.trim();
  if (!value) return "";
  return `
      <tr>
        <td style="padding:12px 16px; font-size:13px; color:#64748B; border-top:1px solid #E2E8F0;">Client Name</td>
        <td style="padding:12px 16px; font-size:13px; color:#0F172A; font-weight:600; border-top:1px solid #E2E8F0;">${escapeHtml(value)}</td>
      </tr>`;
}

/**
 * Request Invoice workflow — Section B. Sent to the original requester automatically, only after a real InvoiceLine has actually, successfully been saved as Raised for their requested project — never before.
 *
 * Every user-controlled value (requester name, PR Number, client, project title) is HTML-escaped exactly once, where it is placed into
 * the markup: the body values below, and the preview text as a whole. renderEmailLayout() inserts `previewText` into a hidden <div>
 * verbatim, so an unescaped title containing "</div>" would close that block and render injected markup at the top of the email.
 * The preview string is therefore built from the RAW values and escaped once as a complete string — never from already-escaped parts.
 */
export function buildInvoiceRaisedSuccessfullyEmail(data: InvoiceRaisedSuccessfullyEmailData): EmailContent {
  const requesterName = escapeHtml(data.requesterName);
  const prNo = escapeHtml(data.prNo);
  const projectTitle = escapeHtml(data.projectTitle);

  const bodyHtml = `
    ${renderInvoiceEmailHeading(INVOICE_RAISED_HEADING_PREFIX, data)}
    <p style="margin:0 0 16px;">Hello ${requesterName},</p>
    <p style="margin:0 0 16px;">
      Your requested invoice has been successfully raised.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin:16px 0; border:1px solid #E2E8F0; border-radius:8px;">
      <tr>
        <td style="padding:12px 16px; font-size:13px; color:#64748B;">PR Number</td>
        <td style="padding:12px 16px; font-size:13px; color:#0F172A; font-weight:600;">${prNo}</td>
      </tr>${clientRow(data.client)}
      <tr>
        <td style="padding:12px 16px; font-size:13px; color:#64748B; border-top:1px solid #E2E8F0;">Project Title</td>
        <td style="padding:12px 16px; font-size:13px; color:#0F172A; font-weight:600; border-top:1px solid #E2E8F0;">${projectTitle}</td>
      </tr>
    </table>

    ${renderButton(data.invoicesUrl, "Open Project Invoices")}
  `;

  return {
    // Same text as the body heading above: "Invoice has been raised - {client, 3 words} - {title, 3 words} - {PR no.}" (see invoiceEmailHeading.ts).
    subject: buildInvoiceRaisedSubject(data),
    html: renderEmailLayout({ bodyHtml, previewText: escapeHtml(`Your requested invoice for ${data.projectTitle} has been raised.`) }),
  };
}
