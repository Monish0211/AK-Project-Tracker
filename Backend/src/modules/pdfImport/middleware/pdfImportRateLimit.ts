import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../../shared/utils/AppError.js";

/**
 * Minimal, self-contained per-user rate limiter for the Claude AI-assist
 * endpoint only. No rate-limiting library or existing pattern exists
 * anywhere else in this backend (confirmed by repository inspection ahead
 * of Stage 4) — this is a deliberately small, scoped addition rather than
 * a general-purpose library introduction, matching the approved plan's
 * "smallest safe blast radius" principle. Exact limits are an operational
 * tuning knob (Stage 3 §26 open decision), not hardcoded as a magic
 * number buried in logic — see the two exported constants below.
 *
 * In-memory only: resets on process restart, and does not share state
 * across multiple backend instances if this app is ever horizontally
 * scaled — acceptable for this feature's current single-instance
 * deployment, but a known limitation worth naming rather than hiding.
 */

// Raised from an earlier 10/hour: the PDF Import modal now supports up to
// 20 files per import session, each calling this endpoint once (sequential,
// never parallel — see extractPdfFilesSequentially() on the frontend) when
// the user's Claude checkbox is on. A limit below ~20 would make a single
// legitimate full-batch import fall back for its own back half purely
// because of this counter, not because of any real abuse — so this is set
// comfortably above one full batch while still bounding repeated-batch abuse.
export const PDF_IMPORT_AI_RATE_LIMIT_MAX_REQUESTS = 25;
export const PDF_IMPORT_AI_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

interface WindowState {
  count: number;
  windowStart: number;
}

const requestWindows = new Map<string, WindowState>();

function rateLimitKey(req: Request): string {
  return req.user?.sub ?? req.ip ?? "unknown";
}

export function pdfImportRateLimit(req: Request, _res: Response, next: NextFunction): void {
  const key = rateLimitKey(req);
  const now = Date.now();
  const existing = requestWindows.get(key);

  if (!existing || now - existing.windowStart > PDF_IMPORT_AI_RATE_LIMIT_WINDOW_MS) {
    requestWindows.set(key, { count: 1, windowStart: now });
    next();
    return;
  }

  if (existing.count >= PDF_IMPORT_AI_RATE_LIMIT_MAX_REQUESTS) {
    throw new AppError("Too many AI-assisted PDF extraction requests. Please try again later.", 429);
  }

  existing.count += 1;
  next();
}
