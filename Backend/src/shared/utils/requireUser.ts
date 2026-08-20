import type { Request } from "express";
import { AppError } from "./AppError.js";
import type { AccessTokenPayload } from "../types/auth.types.js";

/**
 * Every controller that calls this runs after `authenticate`, so req.user is
 * always set in practice — this only satisfies TypeScript's optional typing
 * and gives a real (if practically unreachable) 401 instead of a runtime
 * crash if that assumption is ever violated.
 */
export function requireUser(req: Request): AccessTokenPayload {
  if (!req.user) {
    throw new AppError("Authentication required.", 401);
  }
  return req.user;
}
