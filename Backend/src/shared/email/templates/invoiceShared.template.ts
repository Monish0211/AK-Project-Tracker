import { EMAIL_SUBJECTS } from "../email.constants.js";
import type { EmailContent, InvoiceSharedEmailData } from "../email.types.js";
import { renderButton, renderEmailLayout } from "./layout.template.js";
import { formatInvoiceAmountForEmail } from "./invoiceAmount.format.js";

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}


/**
 * Request Invoice workflow — Section C: "Send Invoice To." A separate,
 * manual action the responsible person takes AFTER an invoice line has
 * already, successfully been saved — see invoice.service.ts's
 * sendInvoiceLineToUsers() for why this is only ever built from the actual
 * saved row, never a preview/draft figure.
 */
export function buildInvoiceSharedEmail(data: InvoiceSharedEmailData): EmailContent {
  const bodyHtml = `
    <p style="margin:0 0 16px;">Hello ${data.recipientName},</p>
    <p style="margin:0 0 16px;">
      ${data.sharedByName} has shared the following invoice with you.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin:16px 0; border:1px solid #E2E8F0; border-radius:8px;">
      <tr>
        <td style="padding:12px 16px; font-size:13px; color:#64748B;">Invoice No</td>
        <td style="padding:12px 16px; font-size:13px; color:#0F172A; font-weight:600;">${data.invoiceNo}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px; font-size:13px; color:#64748B; border-top:1px solid #E2E8F0;">Invoice Date</td>
        <td style="padding:12px 16px; font-size:13px; color:#0F172A; font-weight:600; border-top:1px solid #E2E8F0;">${formatDate(data.invoiceDateIso)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px; font-size:13px; color:#64748B; border-top:1px solid #E2E8F0;">Invoice Amount</td>
        <td style="padding:12px 16px; font-size:13px; color:#0F172A; font-weight:600; border-top:1px solid #E2E8F0;">${formatInvoiceAmountForEmail(data)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px; font-size:13px; color:#64748B; border-top:1px solid #E2E8F0;">PR Number</td>
        <td style="padding:12px 16px; font-size:13px; color:#0F172A; font-weight:600; border-top:1px solid #E2E8F0;">${data.prNo}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px; font-size:13px; color:#64748B; border-top:1px solid #E2E8F0;">Project Title</td>
        <td style="padding:12px 16px; font-size:13px; color:#0F172A; font-weight:600; border-top:1px solid #E2E8F0;">${data.projectTitle}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px; font-size:13px; color:#64748B; border-top:1px solid #E2E8F0;">Client</td>
        <td style="padding:12px 16px; font-size:13px; color:#0F172A; font-weight:600; border-top:1px solid #E2E8F0;">${data.client}</td>
      </tr>
    </table>

    ${renderButton(data.invoicesUrl, "Open Project Invoices")}
  `;

  return {
    subject: EMAIL_SUBJECTS.INVOICE_SHARED,
    html: renderEmailLayout({ bodyHtml, previewText: `${data.sharedByName} shared invoice ${data.invoiceNo} with you.` }),
  };
}
