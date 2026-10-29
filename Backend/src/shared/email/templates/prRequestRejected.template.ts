import type { EmailContent, PRRequestRejectedEmailData } from "../email.types.js";
import { buildPRRequestRejectedSubject, renderPRRequestRejectedHeading } from "./invoiceEmailHeading.js";
import { renderEmailLayout } from "./layout.template.js";
import { escapeHtml } from "./missingOtherExpenses.template.js";

/**
 * Sent to the original requester if either Accounts or the assigned PMO Manager rejects the request — no Project is ever created on this path.
 *
 * Subject AND the heading at the top of the body are the same line (Oct 2026): "Your PR Request has been rejected - {full client name} - {full project title}"
 * — whole values (no three-word cut) and deliberately no PR number (it stays in the details table). Every user-entered value — including the free-text
 * rejection reason — is HTML-escaped exactly once where it is placed into the markup; the preview text is built from the RAW values and escaped once as a whole.
 */
export function buildPRRequestRejectedEmail(data: PRRequestRejectedEmailData): EmailContent {
  const rejectedByName = escapeHtml(data.rejectedByName);

  const bodyHtml = `
    ${renderPRRequestRejectedHeading(data)}
    <p style="margin:0 0 16px;">Hello ${escapeHtml(data.requesterName)},</p>
    <p style="margin:0 0 16px;">
      Your PR Request was rejected by ${rejectedByName}. No Project has been created for this request.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin:16px 0; border:1px solid #E2E8F0; border-radius:8px;">
      <tr>
        <td style="padding:12px 16px; font-size:13px; color:#64748B;">PR Number</td>
        <td style="padding:12px 16px; font-size:13px; color:#0F172A; font-weight:600;">${escapeHtml(data.prNo)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px; font-size:13px; color:#64748B; border-top:1px solid #E2E8F0;">Project Title</td>
        <td style="padding:12px 16px; font-size:13px; color:#0F172A; font-weight:600; border-top:1px solid #E2E8F0;">${escapeHtml(data.projectTitle)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px; font-size:13px; color:#64748B; border-top:1px solid #E2E8F0;">Reason</td>
        <td style="padding:12px 16px; font-size:13px; color:#0F172A; font-weight:600; border-top:1px solid #E2E8F0;">${escapeHtml(data.reason)}</td>
      </tr>
    </table>

    <p style="margin:16px 0 0; color:#64748B; font-size:12.5px;">
      If you believe this was rejected in error, please contact ${rejectedByName} directly.
    </p>
  `;

  return {
    subject: buildPRRequestRejectedSubject(data),
    html: renderEmailLayout({ bodyHtml, previewText: escapeHtml(`PR Request ${data.prNo} was rejected.`) }),
  };
}
