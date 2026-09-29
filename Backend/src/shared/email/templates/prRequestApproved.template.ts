import { EMAIL_SUBJECTS } from "../email.constants.js";
import type { EmailContent, PRRequestApprovedEmailData } from "../email.types.js";
import { renderButton, renderEmailLayout } from "./layout.template.js";

/** Sent to the original requester once the PMO Manager's approval has created the real Project — the final, successful outcome of the workflow. */
export function buildPRRequestApprovedEmail(data: PRRequestApprovedEmailData): EmailContent {
  const bodyHtml = `
    <p style="margin:0 0 16px;">Hello ${data.requesterName},</p>
    <p style="margin:0 0 16px;">
      Your PR Request has been fully approved and the Project has been created in the PMO Portal.
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

    ${renderButton(data.projectUrl, "View Project")}
  `;

  return {
    subject: EMAIL_SUBJECTS.PR_REQUEST_APPROVED,
    html: renderEmailLayout({ bodyHtml, previewText: `PR Request ${data.prNo} approved — Project created.` }),
  };
}
