import { EMAIL_SUBJECTS } from "../email.constants.js";
import type { EmailContent, ResetSuccessEmailData } from "../email.types.js";
import { renderEmailLayout } from "./layout.template.js";

/**
 * A security notice, not an action prompt — no button, since there's
 * nothing to do here. Ready for both self-service change-password (Auth)
 * and admin-initiated reset (Users) to send once either is wired to email.
 */
export function buildResetSuccessEmail(data: ResetSuccessEmailData): EmailContent {
  const changedAt = new Date(data.changedAtIso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const bodyHtml = `
    <p style="margin:0 0 16px;">Hello ${data.fullName},</p>
    <p style="margin:0 0 16px;">
      Your PMO Portal password was changed on <strong>${changedAt}</strong>.
    </p>
    <p style="margin:0; color:#64748B; font-size:12.5px;">
      If you didn't make this change, contact your administrator immediately.
    </p>
  `;

  return {
    subject: EMAIL_SUBJECTS.RESET_SUCCESS,
    html: renderEmailLayout({ bodyHtml, previewText: "Your PMO Portal password was changed." }),
  };
}
