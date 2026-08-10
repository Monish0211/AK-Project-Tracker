import jwt from "jsonwebtoken";
import type { AccessTokenPayload } from "../types/auth.types.js";
import { env } from "./env.js";

/**
 * Only an access token exists today. `signAccessToken`/`verifyAccessToken`
 * are kept as their own named functions (rather than inlined in the auth
 * service) so a `signRefreshToken`/`verifyRefreshToken` pair can be added
 * later without touching how the access token is issued/checked.
 */
export function signAccessToken(payload: AccessTokenPayload): string {
  const options: jwt.SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as NonNullable<jwt.SignOptions["expiresIn"]>,
  };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
}
