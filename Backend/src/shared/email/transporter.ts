import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { env } from "../utils/env.js";

/**
 * True only when every setting actually needed to send mail is present.
 * Deliberately NOT enforced in env.ts's schema — email is infrastructure
 * other modules opt into, not a hard dependency of the app, so a backend
 * with no mail server configured yet still boots and Auth/Users keep
 * working. Every other function in this file treats "not configured" as a
 * normal, expected state, never a fatal one.
 */
export function isEmailConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS && env.SMTP_FROM_EMAIL);
}

let transporter: Transporter | null = null;

function createTransporter(): Transporter {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });
}

/**
 * One pooled connection for the lifetime of the process, created lazily on
 * first use rather than at module-load time — importing this file must
 * never throw just because SMTP isn't configured yet.
 */
export function getTransporter(): Transporter {
  if (!isEmailConfigured()) {
    throw new Error(
      "Email is not configured — set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM_EMAIL in .env."
    );
  }

  if (!transporter) {
    transporter = createTransporter();
  }

  return transporter;
}

/**
 * Verifies the SMTP connection/credentials — called once at server startup
 * (see server.ts) so a misconfigured mail server is discovered immediately
 * instead of on the first real send. Never throws: a missing config or a
 * failed verification is logged and email sending is simply unavailable
 * until fixed, the rest of the app boots and runs normally either way.
 */
export async function verifyEmailConnection(): Promise<void> {
  if (!isEmailConfigured()) {
    console.warn(
      "[email] SMTP is not configured (SMTP_HOST/SMTP_USER/SMTP_PASS/SMTP_FROM_EMAIL missing) — email sending is disabled."
    );
    return;
  }

  try {
    await getTransporter().verify();
    console.log(`[email] SMTP connection verified — sending as "${env.SMTP_FROM_NAME}" <${env.SMTP_FROM_EMAIL}>.`);
  } catch (error) {
    console.error("[email] SMTP connection verification failed:", error instanceof Error ? error.message : error);
  }
}
