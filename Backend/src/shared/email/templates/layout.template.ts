import { EMAIL_BRAND } from "../email.constants.js";

/** Shared CTA button markup — welcome/accountCreated/forgotPassword all need one, so it lives here once instead of three times. */
export function renderButton(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td style="border-radius:8px; background-color:#2563EB;">
        <a href="${url}" target="_blank" style="display:inline-block; padding:12px 24px; color:#FFFFFF; font-size:14px; font-weight:600; text-decoration:none;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;
}

export interface EmailLayoutOptions {
  /** Hidden preview text most mail clients show next to the subject line in the inbox list. */
  previewText?: string;
  /** Pre-rendered HTML for the email's own content — the layout only supplies the header/footer shell around it. */
  bodyHtml: string;
}

/**
 * The one HTML shell every template renders into — inline styles and
 * `<table>`-based layout throughout, deliberately, because email clients
 * (Outlook in particular) don't reliably support modern CSS like flexbox
 * or grid. Kept as plain string templates (no external templating engine)
 * to avoid adding a dependency for something this small.
 */
export function renderEmailLayout({ previewText, bodyHtml }: EmailLayoutOptions): string {
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${EMAIL_BRAND.COMPANY_NAME} ${EMAIL_BRAND.PORTAL_NAME}</title>
  </head>
  <body style="margin:0; padding:0; background-color:#F1F5F9; font-family:Segoe UI, Helvetica, Arial, sans-serif;">
    ${
      previewText
        ? `<div style="display:none; max-height:0; overflow:hidden; opacity:0;">${previewText}</div>`
        : ""
    }
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F1F5F9; padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; background-color:#FFFFFF; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(15,23,42,0.08);">
            <tr>
              <td style="background-color:#0F172A; padding:24px 32px;">
                <span style="color:#FFFFFF; font-size:16px; font-weight:700; letter-spacing:0.02em;">
                  ${EMAIL_BRAND.COMPANY_NAME}
                </span>
                <span style="color:#94A3B8; font-size:13px; margin-left:8px;">${EMAIL_BRAND.PORTAL_NAME}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px; color:#1E293B; font-size:14px; line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px; background-color:#F8FAFC; border-top:1px solid #E2E8F0;">
                <p style="margin:0; color:#94A3B8; font-size:11.5px; line-height:1.5;">
                  &copy; ${year} ${EMAIL_BRAND.COMPANY_NAME}. All rights reserved.<br />
                  This is an automated message from the ${EMAIL_BRAND.PORTAL_NAME} — please do not reply directly to this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
