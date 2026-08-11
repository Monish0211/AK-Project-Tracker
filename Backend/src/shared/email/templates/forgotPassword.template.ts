import { EMAIL_SUBJECTS } from "../email.constants.js";
import type { EmailContent, ForgotPasswordEmailData } from "../email.types.js";
import { renderButton, renderEmailLayout } from "./layout.template.js";

/**
 * Ready for the Forgot Password flow (not wired to any endpoint yet — see
 * auth.service.ts's forgotPassword(), which already generates the token
 * this template's resetUrl would carry, but doesn't email it out today).
 */
export function buildForgotPasswordEmail(data: ForgotPasswordEmailData): EmailContent {
  const bodyHtml = `
    <p style="margin:0 0 16px;">Hello ${data.fullName},</p>
    <p style="margin:0 0 16px;">
      We received a request to reset your PMO Portal password. Click the button below to choose a new one.
    </p>
    ${renderButton(data.resetUrl, "Reset Password")}
    <p style="margin:16px 0 0; color:#64748B; font-size:12.5px;">
      This link expires in ${data.expiresInMinutes} minutes. If you didn't request a password reset, you can
      safely ignore this email — your password will not be changed.
    </p>
  `;

  return {
    subject: EMAIL_SUBJECTS.FORGOT_PASSWORD,
    html: renderEmailLayout({ bodyHtml, previewText: "Reset your PMO Portal password." }),
  };
}
