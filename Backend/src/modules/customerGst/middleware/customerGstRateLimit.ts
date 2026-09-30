import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../../shared/utils/AppError.js";

/**
 * Minimal, self-contained per-user rate limiter for the GST extraction
 * endpoint only — same in-memory pattern as pdfImport's
 * pdfImportRateLimit.ts (its own comment already establishes there is no
 * rate-limiting library anywhere in this backend), deliberately a separate
 * Map/counter rather than sharing pdfImport's, so this feature's usage can
 * never starve or be starved by PDF Import's own quota.
 *
 * In-memory only: resets on process restart, no cross-instance sharing —
 * same known, acceptable limitation as pdfImport's, and this feature is a
 * single-document, single-customer-form action, so the ceiling here is
 * intentionally lower than PDF Import's 25/hour (which supports up to 20
 * files per import session).
 */
export const CUSTOMER_GST_RATE_LIMIT_MAX_REQUESTS = 15;
export const CUSTOMER_GST_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

interface WindowState {
  count: number;
  windowStart: number;
}

const requestWindows = new Map<string, WindowState>();

function rateLimitKey(req: Request): string {
  return req.user?.sub ?? req.ip ?? "unknown";
}

export function customerGstRateLimit(req: Request, _res: Response, next: NextFunction): void {
  const key = rateLimitKey(req);
  const now = Date.now();
  const existing = requestWindows.get(key);

  if (!existing || now - existing.windowStart > CUSTOMER_GST_RATE_LIMIT_WINDOW_MS) {
    requestWindows.set(key, { count: 1, windowStart: now });
    next();
    return;
  }

  if (existing.count >= CUSTOMER_GST_RATE_LIMIT_MAX_REQUESTS) {
    throw new AppError("Too many GST extraction requests. Please try again later.", 429);
  }

  existing.count += 1;
  next();
}
