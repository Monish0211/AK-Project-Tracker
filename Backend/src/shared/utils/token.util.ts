import crypto from "node:crypto";

/**
 * Refresh tokens and password-reset tokens are opaque, high-entropy random
 * strings — NOT JWTs — specifically so they're revocable: a signed JWT
 * can't be un-issued without a separate revocation list, which is exactly
 * what storing these (hashed) in the database already gives us.
 */
export function generateOpaqueToken(byteLength = 48): string {
  return crypto.randomBytes(byteLength).toString("hex");
}

/**
 * Only the hash is ever persisted. sha256 (not bcrypt) is deliberate here:
 * these tokens are already high-entropy random values, not user-chosen
 * secrets, so there's nothing for a slow hash to protect against — sha256
 * just keeps the plaintext bearer token out of the database.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
