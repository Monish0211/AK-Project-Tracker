import type { EmailContent, InvoiceRequestAssignedEmailData } from "../email.types.js";
import { INVOICE_REQUEST_HEADING_PREFIX, buildInvoiceRequestSubject, renderInvoiceEmailHeading } from "./invoiceEmailHeading.js";
import { renderButton, renderEmailLayout } from "./layout.template.js";
import { escapeHtml } from "./missingOtherExpenses.template.js";

/**
 * One <tr> per row, only when the value is present — same "skip if empty" convention as an optional row in a manual template's table
 * (a blank "Address"/"Special Note" row would just be visual noise). Every value here is user-entered (or comes from the Project
 * record), so it is HTML-escaped: a note such as "<b>x</b>" shows as text and can never inject markup into the email.
 */
function row(label: string, rawValue: string | null, borderTop = true): string {
  if (!rawValue) return "";
  const value = escapeHtml(rawValue);
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
/**
 * The "Attachments" block (Oct 2026). `attached`: the files are on THIS email — listed so the recipient can see what to expect.
 * `not_attached`: they were uploaded and are kept, but did not fit / could not be sent with this email — said plainly, never
 * implying the recipient has them. Returns "" when the request had no files.
 */
function attachmentsBlock(attachments: InvoiceRequestAssignedEmailData["attachments"]): string {
  if (!attachments || attachments.files.length === 0) return "";
  const items = attachments.files
    .map((f) => `<li style="margin:0 0 4px;">${escapeHtml(f.fileName)} <span style="color:#64748B;">(${f.kindLabel ? `${escapeHtml(f.kindLabel)} · ` : ""}${escapeHtml(f.sizeLabel)})</span></li>`)
    .join("");
  if (attachments.mode === "attached") {
    return `
    <p style="margin:16px 0 8px; font-size:13px; font-weight:600; color:#0F172A;">Attachments (${attachments.files.length})</p>
    <ul style="margin:0 0 16px; padding-left:20px; font-size:13px; color:#0F172A;">${items}</ul>`;
  }
  const reason = attachments.notAttachedReason ? ` ${escapeHtml(attachments.notAttachedReason)}` : "";
  return `
    <div style="margin:16px 0; padding:12px 16px; border:1px solid #FDE68A; background-color:#FFFBEB; border-radius:8px; font-size:13px; color:#92400E;">
      <p style="margin:0 0 8px; font-weight:600;">The requester uploaded ${attachments.files.length} file${attachments.files.length === 1 ? "" : "s"} with this request, but they could NOT be attached to this email.${reason}</p>
      <ul style="margin:0 0 8px; padding-left:20px;">${items}</ul>
      <p style="margin:0;">The files have been kept with the request. Please ask the requester to send them to you directly.</p>
    </div>`;
}

export function buildInvoiceRequestAssignedEmail(data: InvoiceRequestAssignedEmailData): EmailContent {
  const bodyHtml = `
    ${renderInvoiceEmailHeading(INVOICE_REQUEST_HEADING_PREFIX, data)}
    <p style="margin:0 0 16px;">Hello ${escapeHtml(data.assignedToName)},</p>
    <p style="margin:0 0 16px;">
      ${escapeHtml(data.requesterName)} has requested that you raise the invoice for the project below.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin:16px 0; border:1px solid #E2E8F0; border-radius:8px;">
      <tr>
        <td style="padding:12px 16px; font-size:13px; color:#64748B;">Client Name</td>
        <td style="padding:12px 16px; font-size:13px; color:#0F172A; font-weight:600;">${escapeHtml(data.client)}</td>
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
    ${attachmentsBlock(data.attachments)}
    ${renderButton(data.invoicesUrl, "Open Project Invoices")}
  `;

  return {
    // Same text as the body heading above: "Invoice request - {client, 3 words} - {title, 3 words} - {PR no.}" (see invoiceEmailHeading.ts).
    subject: buildInvoiceRequestSubject(data),
    html: renderEmailLayout({ bodyHtml, previewText: escapeHtml(`${data.requesterName} requested that you raise the invoice for ${data.projectTitle}.`) }),
  };
}
