import type { EmailContent, InvoicePaidEmailData } from "../email.types.js";
import { INVOICE_PAID_HEADING_PREFIX, buildInvoicePaidSubject, renderInvoiceEmailHeading } from "./invoiceEmailHeading.js";
import { renderButton, renderEmailLayout } from "./layout.template.js";
import { formatInvoiceAmountForEmail } from "./invoiceAmount.format.js";
import { escapeHtml } from "./missingOtherExpenses.template.js";


/**
 * Request Invoice workflow — Invoice Paid (Oct 2026). Sent to the original
 * requester (the same person who received the "Invoice Raised Successfully"
 * email for this request) once the raised InvoiceLine genuinely transitions
 * to Paid — see invoiceRequest.service.ts's notifyInvoicePaidIfLinked().
 *
 * Subject AND the heading at the top of the body are the same project line, in the same format as the Invoice Request / Invoice Raised emails:
 * "Invoice Paid - {client, first 3 words} - {project title, first 3 words} - {full PR number}" (see invoiceEmailHeading.ts). The full client, project
 * title and PR number stay in the details table. Every user-entered value is HTML-escaped exactly once where it is placed into the markup; the preview
 * text is built from the RAW values and escaped once as a whole string.
 */
export function buildInvoicePaidEmail(data: InvoicePaidEmailData): EmailContent {
  const bodyHtml = `
    ${renderInvoiceEmailHeading(INVOICE_PAID_HEADING_PREFIX, data)}
    <p style="margin:0 0 16px;">Hello ${escapeHtml(data.requesterName)},</p>
    <p style="margin:0 0 16px;">
      The invoice below has been marked as Paid.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin:16px 0; border:1px solid #E2E8F0; border-radius:8px;">
      <tr>
        <td style="padding:12px 16px; font-size:13px; color:#64748B;">Invoice No</td>
        <td style="padding:12px 16px; font-size:13px; color:#0F172A; font-weight:600;">${escapeHtml(data.invoiceNo)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px; font-size:13px; color:#64748B; border-top:1px solid #E2E8F0;">Invoice Amount</td>
        <td style="padding:12px 16px; font-size:13px; color:#0F172A; font-weight:600; border-top:1px solid #E2E8F0;">${escapeHtml(formatInvoiceAmountForEmail(data))}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px; font-size:13px; color:#64748B; border-top:1px solid #E2E8F0;">Status</td>
        <td style="padding:12px 16px; font-size:13px; color:#16A34A; font-weight:700; border-top:1px solid #E2E8F0;">Paid</td>
      </tr>
      <tr>
        <td style="padding:12px 16px; font-size:13px; color:#64748B; border-top:1px solid #E2E8F0;">PR Number</td>
        <td style="padding:12px 16px; font-size:13px; color:#0F172A; font-weight:600; border-top:1px solid #E2E8F0;">${escapeHtml(data.prNo)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px; font-size:13px; color:#64748B; border-top:1px solid #E2E8F0;">Project Title</td>
        <td style="padding:12px 16px; font-size:13px; color:#0F172A; font-weight:600; border-top:1px solid #E2E8F0;">${escapeHtml(data.projectTitle)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px; font-size:13px; color:#64748B; border-top:1px solid #E2E8F0;">Client</td>
        <td style="padding:12px 16px; font-size:13px; color:#0F172A; font-weight:600; border-top:1px solid #E2E8F0;">${escapeHtml(data.client)}</td>
      </tr>
    </table>

    ${renderButton(data.invoicesUrl, "Open Project Invoices")}
  `;

  return {
    subject: buildInvoicePaidSubject(data),
    html: renderEmailLayout({ bodyHtml, previewText: escapeHtml(`Invoice ${data.invoiceNo} for ${data.projectTitle} has been paid.`) }),
  };
}
