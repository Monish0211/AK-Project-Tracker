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

/**
 * P10 — algorithm explicitly pinned to HS256 (the only algorithm
 * signAccessToken() above ever uses, since JWT_SECRET is a plain shared
 * string, not an RSA/EC keypair). Without this, jsonwebtoken accepts
 * whatever `alg` the token header itself claims — the classic
 * algorithm-confusion risk. Signing is unchanged; this only narrows what
 * verify() will accept.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] }) as AccessTokenPayload;
}
