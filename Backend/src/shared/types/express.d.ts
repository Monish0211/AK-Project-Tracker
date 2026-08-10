import type { AccessTokenPayload } from "./auth.types.js";

/**
 * `authenticate.ts` attaches the decoded token here after verifying it, so
 * every downstream controller/middleware gets a typed `req.user` instead of
 * casting `req` on every use.
 */
declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export {};
