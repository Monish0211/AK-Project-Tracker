import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError.js";
import { env } from "../utils/env.js";

/**
 * Protects POST /internal/timesheets/poll — this is hit by a
 * scheduler/cron process, never by a logged-in Portal User, so it can't use
 * `authenticate`/`authorize`. A plain shared-secret header check instead:
 * `X-Internal-Secret: <INTERNAL_POLL_SECRET>`. If the secret isn't
 * configured at all, every request is rejected with 503 rather than
 * silently accepting an unprotected call — the same "fail closed, not
 * open" instinct as the rest of this app's security middleware.
 */
export function verifyInternalSecret(req: Request, _res: Response, next: NextFunction) {
  if (!env.INTERNAL_POLL_SECRET) {
    throw new AppError("Internal polling is not configured (INTERNAL_POLL_SECRET is unset).", 503);
  }

  const provided = req.headers["x-internal-secret"];
  if (provided !== env.INTERNAL_POLL_SECRET) {
    throw new AppError("Invalid or missing internal secret.", 401);
  }

  next();
}
