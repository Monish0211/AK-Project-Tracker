import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { verifyAccessToken } from "../utils/jwt.util.js";
import { findUserAccountStatusById } from "../../modules/auth/repository/auth.repository.js";
import type { AccessTokenPayload } from "../types/auth.types.js";
import { ACTIVE_COUNTRY_HEADER, buildCountryContext, getCountryAccessMode, loadAccountAndCountryGrants, runWithCountryContext } from "../utils/countryAccess.js";

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

  // Country access off (the default): exactly the previous single account-status lookup. Shadow / enforce: the account state and the country grants come back
  // in ONE statement (see loadAccountAndCountryGrants), then the very same checks run in the very same order.
  const mode = getCountryAccessMode();
  const combined = mode === "off" ? null : await loadAccountAndCountryGrants(payload.sub);
  const status = combined ? combined.account : await findUserAccountStatusById(payload.sub);
  if (!status || !status.isActive) {
    throw new AppError("Your account is inactive. Please contact your administrator.", 403);
  }
  if (status.accountLocked) {
    throw new AppError("Your account is locked. Please contact your administrator.", 403);
  }

  // Country access (Global Multi-Country Phase 1). With the mode off (the default) this is exactly the previous behaviour: no
  // extra query, no context. Otherwise the account's country grants are re-read from the database for THIS request (never taken
  // from the token) and the context is made available both on req.user and to helpers that only receive a caller id. An invalid
  // X-Active-Country is NOT rejected here, so /auth/me and logout still work with a stale header; it is refused when a
  // project-scoped read or check actually needs it.
  if (mode === "off" || !combined) {
    req.user = payload;
    next();
    return;
  }
  const country = await buildCountryContext(payload.sub, req.headers[ACTIVE_COUNTRY_HEADER], mode, combined.grants);
  req.user = { ...payload, country };
  runWithCountryContext(country, () => next());
});
