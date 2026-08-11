import { env } from "../utils/env.js";
import { getTransporter, isEmailConfigured } from "./transporter.js";
import type { SendEmailOptions, SendEmailResult } from "./email.types.js";

/**
 * The one function every future email-sending call goes through, no matter
 * which module or template it comes from. Deliberately never throws — a
 * failed or unconfigured email must never take down the request that
 * triggered it (e.g. Create User must still succeed even if the welcome
 * email can't be delivered), so failure is a returned result, not an
 * exception the caller is forced to catch.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  if (!isEmailConfigured()) {
    const error = "Email is not configured — SMTP_* environment variables are missing.";
    console.error(`[email] ${error}`);
    return { success: false, error };
  }

  try {
    await getTransporter().sendMail({
      from: `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM_EMAIL}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email delivery error.";
    console.error("[email] Failed to send email:", message);
    return { success: false, error: message };
  }
}
