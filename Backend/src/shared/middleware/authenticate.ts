import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { verifyAccessToken } from "../utils/jwt.util.js";
import { findUserAccountStatusById } from "../../modules/auth/repository/auth.repository.js";
import type { AccessTokenPayload } from "../types/auth.types.js";

/**
 * Verifies the `Authorization: Bearer <token>` header and attaches the
 * decoded payload to `req.user`.
 *
 * Existing-JWT session invalidation — this now also re-checks the caller's
 * CURRENT isActive/accountLocked state on every request, via a single
 * indexed-PK lookup (findUserAccountStatusById() — deliberately not
 * findUserById()'s heavier `include: { role: true }`, which this check
 * doesn't need). This supersedes the previous "deliberately does not
 * re-check the DB" design: an Administrator/PMO Manager disabling or
 * locking a user must take effect immediately on that user's
 * ALREADY-ISSUED access token too, not just block future logins/refreshes
 * — previously, a still-valid (unexpired) access token kept working
 * against every protected route until it naturally expired, since only
 * refreshAccessToken() re-checked account state. A missing user row (e.g.
 * deleted while a still-valid JWT was in the caller's hands) is treated the
 * same as deactivated, rather than crashing on a null read.
 *
 * Everything else about session lifetime is unchanged: deactivating/
 * locking a user (user.service.ts's updateUser()) still immediately
 * revokes every refresh token for that user, and refreshAccessToken()
 * still independently re-checks isActive/accountLocked before issuing a
 * new access token.
 */
export const authenticate = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    throw new AppError("Authentication required.", 401);
  }

  const token = header.slice("Bearer ".length).trim();

  let payload: AccessTokenPayload;
  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError("Session expired. Please log in again.", 401);
    }
    throw new AppError("Invalid authentication token.", 401);
  }

  const status = await findUserAccountStatusById(payload.sub);
  if (!status || !status.isActive) {
    throw new AppError("Your account is inactive. Please contact your administrator.", 403);
  }
  if (status.accountLocked) {
    throw new AppError("Your account is locked. Please contact your administrator.", 403);
  }

  req.user = payload;
  next();
});
