import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError.js";

/**
 * P1 — per-IP rate limiting for the unauthenticated Auth endpoints. Same
 * minimal, self-contained sliding-window shape already proven for the one
 * other rate limiter in this backend (pdfImportMiddleware/pdfImportRateLimit.ts
 * — confirmed by repository inspection to be the only precedent) — not a
 * new library, matching that file's own "smallest safe blast radius"
 * principle.
 *
 * Keyed by `req.ip`, not `req.user.sub` — every route this guards runs
 * BEFORE `authenticate`, so there is no authenticated user yet to key on.
 * This is deliberately a DIFFERENT, narrower protection than the existing
 * 5-failed-attempts -> accountLocked guard in auth.service.ts (which is
 * per-ACCOUNT and is NOT weakened, removed, or replaced by this file):
 *   - The per-account lock stops repeated guessing against ONE account,
 *     from anywhere.
 *   - This per-IP limiter stops (a) password spraying — many DIFFERENT
 *     accounts, each individually under the 5-attempt threshold, from the
 *     same source — and (b) blunt volumetric abuse of forgot-password /
 *     reset-password / reset-token validation, none of which the
 *     per-account lock touches at all (forgot-password/reset-password
 *     don't even require a valid account to hit).
 *   - It only PARTIALLY mitigates deliberate account-lockout DoS (an
 *     attacker who controls enough distinct source IPs can still lock a
 *     victim's account 5-attempts-at-a-time from many IPs) — closing that
 *     completely would need a policy decision (CAPTCHA/step-up after N
 *     failures) explicitly flagged as a business decision in the final
 *     report, not invented here.
 *
 * In-memory only: resets on process restart, and does not share state
 * across multiple backend instances if this app is ever horizontally
 * scaled — confirmed acceptable for today's single-instance deployment (no
 * PM2/Docker/K8s config found; shared/scheduler/timesheetPollScheduler.ts's
 * own comment already assumes a single in-process instance) — named here
 * explicitly, same as the PDF-import limiter's own comment, rather than
 * hidden, so a future move to multiple instances doesn't silently
 * reintroduce this gap.
 *
 * Exact thresholds are an operational tuning knob (same status as the PDF
 * import limiter's own PDF_IMPORT_AI_RATE_LIMIT_MAX_REQUESTS) — generous
 * enough that a legitimate user who fat-fingers their password a few times,
 * or a small team sharing one office IP, is never blocked, while still
 * bounding scripted abuse.
 */

interface WindowState {
  count: number;
  windowStart: number;
}

/**
 * Each call creates its own independent Map — every exported limiter below
 * has its own counters, so hitting /login's limit never affects
 * /forgot-password's, etc.
 */
function createIpRateLimit(maxRequests: number, windowMs: number, message: string) {
  const requestWindows = new Map<string, WindowState>();

  return function ipRateLimit(req: Request, _res: Response, next: NextFunction): void {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const existing = requestWindows.get(key);

    if (!existing || now - existing.windowStart > windowMs) {
      requestWindows.set(key, { count: 1, windowStart: now });
      next();
      return;
    }

    if (existing.count >= maxRequests) {
      throw new AppError(message, 429);
    }

    existing.count += 1;
    next();
  };
}

// POST /auth/login — generous relative to the existing 5-attempts-per-
// ACCOUNT lock (this is a per-IP ceiling covering many DIFFERENT accounts,
// e.g. password spraying), while still bounding scripted abuse from one source.
export const LOGIN_RATE_LIMIT_MAX_REQUESTS = 20;
export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const loginRateLimit = createIpRateLimit(
  LOGIN_RATE_LIMIT_MAX_REQUESTS,
  LOGIN_RATE_LIMIT_WINDOW_MS,
  "Too many login attempts from this network. Please try again later."
);

// POST /auth/forgot-password — lower ceiling than login: a legitimate user
// almost never requests more than one or two resets in a quarter hour, and
// each accepted request sends a real email (reset-email-flooding concern).
export const FORGOT_PASSWORD_RATE_LIMIT_MAX_REQUESTS = 5;
export const FORGOT_PASSWORD_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const forgotPasswordRateLimit = createIpRateLimit(
  FORGOT_PASSWORD_RATE_LIMIT_MAX_REQUESTS,
  FORGOT_PASSWORD_RATE_LIMIT_WINDOW_MS,
  "Too many password reset requests from this network. Please try again later."
);

// POST /auth/reset-password and GET /auth/validate-reset-token — shared
// limiter (both are exercised by the same "I have/guessed a token" flow;
// splitting them would just let an attacker double their effective budget
// by alternating endpoints). The 256-bit opaque token itself is not
// practically brute-forceable, but this is defense-in-depth against the
// endpoint being hammered regardless.
export const RESET_TOKEN_RATE_LIMIT_MAX_REQUESTS = 20;
export const RESET_TOKEN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const resetTokenRateLimit = createIpRateLimit(
  RESET_TOKEN_RATE_LIMIT_MAX_REQUESTS,
  RESET_TOKEN_RATE_LIMIT_WINDOW_MS,
  "Too many password reset attempts from this network. Please try again later."
);
