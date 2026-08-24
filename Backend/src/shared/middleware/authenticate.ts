import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { verifyAccessToken } from "../utils/jwt.util.js";

/**
 * Verifies the `Authorization: Bearer <token>` header and attaches the
 * decoded payload to `req.user`. Deliberately does NOT re-check
 * isActive/accountLocked against the database on every request — that
 * would mean a DB hit per request just for auth. `GET /auth/me` and any
 * write-path service that cares about current account state re-reads the
 * user row itself.
 *
 * Session-lifetime note: deactivating/locking a user (user.service.ts's
 * updateUser()) immediately revokes every refresh token for that user, and
 * refreshAccessToken() independently re-checks isActive/accountLocked
 * before issuing a new access token — so a deactivated/locked account can
 * never extend a session past its already-issued access token's natural
 * expiry (JWT_EXPIRES_IN). The frontend today doesn't even use the refresh
 * flow (see authService.ts), so in practice that expiry is the real,
 * already-short bound. Closing that residual window down to zero would
 * mean re-checking the DB here on every request — deliberately not done.
 */
export const authenticate = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    throw new AppError("Authentication required.", 401);
  }

  const token = header.slice("Bearer ".length).trim();

  try {
    req.user = verifyAccessToken(token);
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError("Session expired. Please log in again.", 401);
    }
    throw new AppError("Invalid authentication token.", 401);
  }

  next();
});
