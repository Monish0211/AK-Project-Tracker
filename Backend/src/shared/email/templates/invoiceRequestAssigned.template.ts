import { EMAIL_SUBJECTS } from "../email.constants.js";
import type { EmailContent, InvoiceRequestAssignedEmailData } from "../email.types.js";
import { renderButton, renderEmailLayout } from "./layout.template.js";

/** One <tr> per row, only when the value is present — same "skip if empty" convention as an optional row in a manual template's table (a blank "Address"/"Special Note" row would just be visual noise). */
function row(label: string, value: string | null, borderTop = true): string {
  if (!value) return "";
  const border = borderTop ? "border-top:1px solid #E2E8F0;" : "";
  return `
      <tr>
        <td style="padding:12px 16px; font-size:13px; color:#64748B; ${border}">${label}</td>
        <td style="padding:12px 16px; font-size:13px; color:#0F172A; font-weight:600; ${border}">${value}</td>
      </tr>`;
}

/**
 * Request Invoice workflow — Section A. Sent to the chosen responsible
 * person the moment a Request Invoice is submitted. Mirrors the team's
 * existing manual "raise the invoice" email template's field set — Client
 * Name/Project Name/PR Number/Client Contact/Phone/Email are always the
 * live Project record; Invoice Amount/Copies/Drawings/Printing/Address/
 * Special Note are whatever the requester filled in (any may be blank).
 * Never sent before an invoice is actually raised — that is the separate
 * "Invoice Raised Successfully" email.
 */
export function buildInvoiceRequestAssignedEmail(data: InvoiceRequestAssignedEmailData): EmailContent {
  const bodyHtml = `
    <p style="margin:0 0 16px;">Hello ${data.assignedToName},</p>
    <p style="margin:0 0 16px;">
      ${data.requesterName} has requested that you raise the invoice for the project below.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin:16px 0; border:1px solid #E2E8F0; border-radius:8px;">
      <tr>
        <td style="padding:12px 16px; font-size:13px; color:#64748B;">Client Name</td>
        <td style="padding:12px 16px; font-size:13px; color:#0F172A; font-weight:600;">${data.client}</td>
      </tr>
      ${row("Project Name", data.projectTitle)}
      ${row("Project No.", data.prNo)}
      ${row("Client Contact Name", data.clientContactName)}
      ${row("Phone Number", data.clientContactPhone)}
      ${row("E-mail Id", data.clientContactEmail)}
      ${row("Invoice Amount", data.invoiceAmountNote)}
      ${row("Number of Copies Required", data.copiesRequired)}
      ${row("Reports/Drawings Available", data.drawingsAvailable)}
      ${row("Report Printing Details", data.printingDetails)}
      ${row("Address", data.address)}
      ${row("Special Note", data.notes)}
    </table>

    ${renderButton(data.invoicesUrl, "Open Project Invoices")}
  `;

  return {
    subject: EMAIL_SUBJECTS.INVOICE_REQUEST_ASSIGNED,
    html: renderEmailLayout({ bodyHtml, previewText: `${data.requesterName} requested that you raise the invoice for ${data.projectTitle}.` }),
  };
}
