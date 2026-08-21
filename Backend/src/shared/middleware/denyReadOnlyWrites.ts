import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Write restriction for the "Read Only" system role.
 *
 * Must run after `authenticate` (needs `req.user.roleName`). Does not
 * replace Module Access, Project Ownership, or Approval checks — those
 * remain on their existing routes/services. Safe (read) methods always
 * pass through; every other HTTP method is rejected with 403.
 *
 * Auth/account endpoints (login, logout, change-password, refresh) must
 * NOT use this middleware — those are not business-data mutations.
 */
export function denyReadOnlyWrites(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    throw new AppError("Authentication required.", 401);
  }

  if (req.user.roleName === "Read Only" && !SAFE_METHODS.has(req.method.toUpperCase())) {
    throw new AppError("Read Only users cannot modify data.", 403);
  }

  next();
}
