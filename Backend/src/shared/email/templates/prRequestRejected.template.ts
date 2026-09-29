import { EMAIL_SUBJECTS } from "../email.constants.js";
import type { EmailContent, PRRequestRejectedEmailData } from "../email.types.js";
import { renderEmailLayout } from "./layout.template.js";

/** Sent to the original requester if either Accounts or the assigned PMO Manager rejects the request — no Project is ever created on this path. */
export function buildPRRequestRejectedEmail(data: PRRequestRejectedEmailData): EmailContent {
  const bodyHtml = `
    <p style="margin:0 0 16px;">Hello ${data.requesterName},</p>
    <p style="margin:0 0 16px;">
      Your PR Request was rejected by ${data.rejectedByName}. No Project has been created for this request.
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
        <td style="padding:12px 16px; font-size:13px; color:#64748B; border-top:1px solid #E2E8F0;">Reason</td>
        <td style="padding:12px 16px; font-size:13px; color:#0F172A; font-weight:600; border-top:1px solid #E2E8F0;">${data.reason}</td>
      </tr>
    </table>

    <p style="margin:16px 0 0; color:#64748B; font-size:12.5px;">
      If you believe this was rejected in error, please contact ${data.rejectedByName} directly.
    </p>
  `;

  return {
    subject: EMAIL_SUBJECTS.PR_REQUEST_REJECTED,
    html: renderEmailLayout({ bodyHtml, previewText: `PR Request ${data.prNo} was rejected.` }),
  };
}
