import { EMAIL_SUBJECTS } from "../email.constants.js";
import type { EmailContent, PRRequestSubmittedEmailData } from "../email.types.js";
import { renderButton, renderEmailLayout } from "./layout.template.js";

/** Sent to the designated Accounts approver the moment a PR Request User submits a new request — the first of the two approval stages. */
export function buildPRRequestSubmittedEmail(data: PRRequestSubmittedEmailData): EmailContent {
  const bodyHtml = `
    <p style="margin:0 0 16px;">Hello ${data.accountsApproverName},</p>
    <p style="margin:0 0 16px;">
      ${data.requesterName} has submitted a new PR Request that requires your approval before it can proceed to the
      assigned PMO Manager.
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
      <tr>
        <td style="padding:12px 16px; font-size:13px; color:#64748B; border-top:1px solid #E2E8F0;">Client</td>
        <td style="padding:12px 16px; font-size:13px; color:#0F172A; font-weight:600; border-top:1px solid #E2E8F0;">${data.client}</td>
      </tr>
    </table>

    ${renderButton(data.reviewUrl, "Review PR Request")}
  `;

  return {
    subject: EMAIL_SUBJECTS.PR_REQUEST_SUBMITTED,
    html: renderEmailLayout({ bodyHtml, previewText: `New PR Request ${data.prNo} needs your approval.` }),
  };
}
