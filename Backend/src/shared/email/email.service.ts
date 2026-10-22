import { env } from "../utils/env.js";
import { getTransporter, isEmailConfigured } from "./transporter.js";
import type { EmailFailureKind, SendEmailOptions, SendEmailResult } from "./email.types.js";

/**
 * Decides how a failed Nodemailer send ended — the one thing a caller needs to know to avoid BOTH losing a notification and
 * sending it twice. Conservative by design: anything that is not clearly a definitive refusal is "unconfirmed" (the message may
 * have been accepted), and the caller must not resend it.
 *
 * Nodemailer puts the mail server's reply on `responseCode` / `response` / `command`, and its own failure class on `code`.
 */
export function classifySendFailure(error: unknown): EmailFailureKind {
  const e = (error ?? {}) as { code?: unknown; responseCode?: unknown; response?: unknown; command?: unknown; message?: unknown };
  const responseCode = typeof e.responseCode === "number" ? e.responseCode : undefined;
  const text = `${typeof e.response === "string" ? e.response : ""} ${typeof e.message === "string" ? e.message : ""}`;

  // The server answered with a permanent "too large" refusal (552 = exceeded storage/size, 5.3.4 = message too big for system).
  if (responseCode !== undefined && responseCode >= 500 && (responseCode === 552 || /5\.3\.4|message size|size limit|too large|exceeds? (the )?(maximum|max|size|limit)/i.test(text))) {
    return "size_rejected";
  }
  // The server replied with an error code to a command, or refused our login / the envelope: it did not accept the message.
  if (responseCode !== undefined || e.code === "EAUTH" || e.code === "EENVELOPE") return "rejected";
  // The connection was never established (refused, or the host name did not resolve) — nothing was transmitted. Only the failed
  // connect / DNS-lookup system call proves that: Nodemailer reports a connection that dropped LATER (even after the whole message
  // was sent) with the same `command: "CONN"`, so the command alone must never be trusted.
  const syscall = typeof (error as { syscall?: unknown } | null)?.syscall === "string" ? (error as { syscall: string }).syscall : "";
  if (syscall === "connect" || syscall === "getaddrinfo") return "rejected";
  // Timeouts, resets, dropped sockets (possibly after the body was sent), or anything unrecognised: we cannot know.
  return "unconfirmed";
}

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
    return { success: false, error, failure: "not_configured" };
  }

  try {
    await getTransporter().sendMail({
      from: `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM_EMAIL}>`,
      to: options.to,
      cc: options.cc,
      subject: options.subject,
      html: options.html,
      text: options.text,
      // Only present when the caller supplied files — every existing caller sends exactly what it always did.
      ...(options.attachments && options.attachments.length > 0
        ? { attachments: options.attachments.map((a) => ({ filename: a.filename, path: a.path, contentType: a.contentType, contentDisposition: "attachment" as const })) }
        : {}),
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email delivery error.";
    console.error("[email] Failed to send email:", message);
    return { success: false, error: message, failure: classifySendFailure(error) };
  }
}
