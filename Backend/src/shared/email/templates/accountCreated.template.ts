import { EMAIL_SUBJECTS } from "../email.constants.js";
import type { AccountCreatedEmailData, EmailContent } from "../email.types.js";
import { renderButton, renderEmailLayout } from "./layout.template.js";

/**
 * Sent the moment an Administrator creates a new PortalUser — the
 * transactional "here are your credentials" email, distinct from
 * welcome.template.ts's friendlier orientation message. Includes the
 * temporary password (plaintext, as typed into the Add User form — never
 * the password hash) because this email is the credential-delivery
 * mechanism. Never includes any internal id (user id, role id, etc.) —
 * only fullName/email/temporaryPassword/roleName/loginUrl.
 */
export function buildAccountCreatedEmail(data: AccountCreatedEmailData): EmailContent {
  const bodyHtml = `
    <p style="margin:0 0 16px;">Hello ${data.fullName},</p>
    <p style="margin:0 0 16px;">
      An account has been created for you on the iFluids Engineering PMO Portal. You can sign in using the
      credentials below.
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

    <p style="margin:0 0 8px; font-weight:600;">First Login Instructions</p>
    <ol style="margin:0 0 16px; padding-left:20px; color:#1E293B;">
      <li style="margin-bottom:4px;">Go to the PMO Portal login page using the button below.</li>
      <li style="margin-bottom:4px;">Sign in with your company email and the temporary password above.</li>
      <li>Choose your own new password when prompted.</li>
    </ol>

    ${renderButton(data.loginUrl, "Log in to the Portal")}

    <p style="margin:16px 0 0; padding:12px 16px; background-color:#FFFBEB; border:1px solid #FDE68A; border-radius:8px; color:#92400E; font-size:12.5px;">
      For security reasons you will be required to change your password during your first login.
    </p>

    <p style="margin:16px 0 0; color:#64748B; font-size:12.5px;">
      If you weren't expecting this account, please contact your administrator.
    </p>
  `;

  return {
    subject: EMAIL_SUBJECTS.ACCOUNT_CREATED,
    html: renderEmailLayout({ bodyHtml, previewText: "Your PMO Portal login details are ready." }),
  };
}
