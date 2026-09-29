import { EMAIL_SUBJECTS } from "../email.constants.js";
import type { EmailContent, PRRequestAccountsApprovedEmailData } from "../email.types.js";
import { renderButton, renderEmailLayout } from "./layout.template.js";

/** Sent to the assigned PMO Manager once Accounts has cleared the request — the second and final approval stage. */
export function buildPRRequestAccountsApprovedEmail(data: PRRequestAccountsApprovedEmailData): EmailContent {
  const bodyHtml = `
    <p style="margin:0 0 16px;">Hello ${data.pmoManagerName},</p>
    <p style="margin:0 0 16px;">
      A PR Request submitted by ${data.requesterName} has cleared Accounts approval and now requires your approval.
      Approving it will create the Project.
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

    ${renderButton(data.reviewUrl, "Review PR Request")}
  `;

  return {
    subject: EMAIL_SUBJECTS.PR_REQUEST_ACCOUNTS_APPROVED,
    html: renderEmailLayout({ bodyHtml, previewText: `PR Request ${data.prNo} needs your approval.` }),
  };
}
