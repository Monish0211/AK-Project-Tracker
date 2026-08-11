import { EMAIL_SUBJECTS } from "../email.constants.js";
import type { AdminPasswordResetEmailData, EmailContent } from "../email.types.js";
import { renderButton, renderEmailLayout } from "./layout.template.js";

/**
 * Sent the moment an Administrator uses Reset Password on someone else's
 * account — a completely separate template from resetSuccess.template.ts,
 * which is for a password the account holder changed themselves. Telling a
 * user "your password was changed" when really an Administrator reset it
 * out from under them (and gave them a temporary password to sign in with)
 * is misleading, so this one says exactly what happened and what to do
 * next. Includes the temporary password (plaintext, exactly as hashed and
 * set) because this email is the credential-delivery mechanism — never the
 * password hash, never any internal id.
 */
export function buildAdminPasswordResetEmail(data: AdminPasswordResetEmailData): EmailContent {
  const bodyHtml = `
    <p style="margin:0 0 16px;">Hello ${data.fullName},</p>
    <p style="margin:0 0 16px;">
      Your PMO Portal account password has been reset by a System Administrator. For security reasons your
      previous password is no longer valid. Use the temporary password below to sign in.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin:16px 0; border:1px solid #E2E8F0; border-radius:8px;">
      <tr>
        <td style="padding:12px 16px; font-size:13px; color:#64748B;">Employee Name</td>
        <td style="padding:12px 16px; font-size:13px; color:#0F172A; font-weight:600;">${data.fullName}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px; font-size:13px; color:#64748B; border-top:1px solid #E2E8F0;">Company Email</td>
        <td style="padding:12px 16px; font-size:13px; color:#0F172A; font-weight:600; border-top:1px solid #E2E8F0;">${data.email}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px; font-size:13px; color:#64748B; border-top:1px solid #E2E8F0;">Temporary Password</td>
        <td style="padding:12px 16px; font-size:13px; color:#0F172A; font-weight:600; font-family:monospace; border-top:1px solid #E2E8F0;">${data.temporaryPassword}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px; font-size:13px; color:#64748B; border-top:1px solid #E2E8F0;">Assigned Role</td>
        <td style="padding:12px 16px; font-size:13px; color:#0F172A; font-weight:600; border-top:1px solid #E2E8F0;">${data.roleName}</td>
      </tr>
    </table>

    ${renderButton(data.loginUrl, "Login to PMO Portal")}

    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin:16px 0 0; background-color:#FFFBEB; border:1px solid #FDE68A; border-radius:8px;">
      <tr>
        <td style="padding:14px 16px; color:#92400E; font-size:12.5px; line-height:1.7;">
          <strong>For security reasons:</strong><br />
          &bull; Your password was reset by an Administrator.<br />
          &bull; You must log in using the temporary password provided above.<br />
          &bull; You will be required to change your password immediately after logging in.<br />
          &bull; The temporary password can only be used once.
        </td>
      </tr>
    </table>

    <p style="margin:16px 0 0; color:#64748B; font-size:12.5px;">
      If you were not expecting this password reset, please contact your PMO Administrator immediately.
    </p>
  `;

  return {
    subject: EMAIL_SUBJECTS.ADMIN_PASSWORD_RESET,
    html: renderEmailLayout({ bodyHtml, previewText: "Your PMO Portal password has been reset by an Administrator." }),
  };
}
