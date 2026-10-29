import type { EmailContent, PRRequestApprovedEmailData } from "../email.types.js";
import { buildPRRequestApprovedSubject, renderPRRequestApprovedHeading } from "./invoiceEmailHeading.js";
import { renderButton, renderEmailLayout } from "./layout.template.js";
import { escapeHtml } from "./missingOtherExpenses.template.js";

/**
 * Sent to the original requester once the PMO Manager's approval has created the real Project — the final, successful outcome of the workflow.
 *
 * Subject AND the heading at the top of the body are the same line (Oct 2026): "Your PR Request has been approved — Project created - {full client name} -
 * {full project title}" — whole values (no three-word cut) and deliberately no PR number (it stays in the details table). Every user-entered value is
 * HTML-escaped exactly once where it is placed into the markup; the preview text is built from the RAW values and escaped once as a whole string.
 */
export function buildPRRequestApprovedEmail(data: PRRequestApprovedEmailData): EmailContent {
  const bodyHtml = `
    ${renderPRRequestApprovedHeading(data)}
    <p style="margin:0 0 16px;">Hello ${escapeHtml(data.requesterName)},</p>
    <p style="margin:0 0 16px;">
      Your PR Request has been fully approved and the Project has been created in the PMO Portal.
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
    </table>

    ${renderButton(data.projectUrl, "View Project")}
  `;

  return {
    subject: buildPRRequestApprovedSubject(data),
    html: renderEmailLayout({ bodyHtml, previewText: escapeHtml(`PR Request ${data.prNo} approved — Project created.`) }),
  };
}
