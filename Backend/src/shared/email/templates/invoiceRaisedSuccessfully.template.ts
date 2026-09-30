import { EMAIL_SUBJECTS } from "../email.constants.js";
import type { EmailContent, InvoiceRaisedSuccessfullyEmailData } from "../email.types.js";
import { renderButton, renderEmailLayout } from "./layout.template.js";

/** Request Invoice workflow — Section B. Sent to the original requester automatically, only after a real InvoiceLine has actually, successfully been saved as Raised for their requested project — never before. */
export function buildInvoiceRaisedSuccessfullyEmail(data: InvoiceRaisedSuccessfullyEmailData): EmailContent {
  const bodyHtml = `
    <p style="margin:0 0 16px;">Hello ${data.requesterName},</p>
    <p style="margin:0 0 16px;">
      Your requested invoice has been successfully raised.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin:16px 0; border:1px solid #E2E8F0; border-radius:8px;">
      <tr>
        <td style="padding:12px 16px; font-size:13px; color:#64748B;">PR Number</td>
        <td style="padding:12px 16px; font-size:13px; color:#0F172A; font-weight:600;">${data.prNo}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px; font-size:13px; color:#64748B; border-top:1px solid #E2E8F0;">Project Title</td>
        <td style="padding:12px 16px; font-size:13px; color:#0F172A; font-weight:600; border-top:1px solid #E2E8F0;">${data.projectTitle}</td>
      </tr>
    </table>

    ${renderButton(data.invoicesUrl, "Open Project Invoices")}
  `;

  return {
    subject: EMAIL_SUBJECTS.INVOICE_RAISED_SUCCESSFULLY,
    html: renderEmailLayout({ bodyHtml, previewText: `Your requested invoice for ${data.projectTitle} has been raised.` }),
  };
}
