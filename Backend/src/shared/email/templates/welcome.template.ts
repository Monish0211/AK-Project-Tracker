import { EMAIL_SUBJECTS } from "../email.constants.js";
import type { EmailContent, WelcomeEmailData } from "../email.types.js";
import { renderButton, renderEmailLayout } from "./layout.template.js";

/**
 * A friendlier orientation message, distinct from accountCreated.template.ts's
 * transactional credentials email — intended for once someone has actually
 * completed their first sign-in (i.e. after forcePasswordChange clears),
 * not the moment their account row is created. No credentials repeated
 * here; just a welcome and a way back into the portal.
 */
export function buildWelcomeEmail(data: WelcomeEmailData): EmailContent {
  const bodyHtml = `
    <p style="margin:0 0 16px;">Hello ${data.fullName},</p>
    <p style="margin:0 0 16px;">
      Welcome to the iFluids Engineering PMO Portal. Your account is fully set up — you can now sign in to
      view your projects, timesheets, and everything else your role has access to.
    </p>
    ${renderButton(data.loginUrl, "Go to the Portal")}
    <p style="margin:16px 0 0; color:#64748B; font-size:12.5px;">
      If you have any trouble signing in, contact your administrator.
    </p>
  `;

  return {
    subject: EMAIL_SUBJECTS.WELCOME,
    html: renderEmailLayout({ bodyHtml, previewText: "Your PMO Portal account is ready to use." }),
  };
}
