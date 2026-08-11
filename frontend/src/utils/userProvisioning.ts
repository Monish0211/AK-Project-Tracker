import type { User } from "../types/UserModel";

/**
 * Frontend-only credential provisioning helpers for User Management. These
 * exist to prepare the exact future backend workflow (Administrator creates
 * user → company email + temporary password generated → employee's first
 * login forces a password change) without implementing any of it for real —
 * no hashing, no email delivery, no auth. Swapping this for a real backend
 * later means replacing these three functions' bodies with API calls; every
 * caller (userManagementService.ts) stays the same.
 */

const COMPANY_EMAIL_DOMAIN = "ifluids.com";

/** "Rajesh Sharma" -> "rajesh.sharma"; single-word names just use the one word. */
function slugifyNameForEmail(fullName: string): string {
  const parts = fullName
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.replace(/[^a-z]/g, ""))
    .filter(Boolean);

  if (parts.length === 0) return "user";
  if (parts.length === 1) return parts[0];
  return `${parts[0]}.${parts[parts.length - 1]}`;
}

/** Generates a unique Company Email for a new user, appending a numeric suffix on collision. */
export function generateCompanyEmail(fullName: string, existingUsers: User[]): string {
  const base = slugifyNameForEmail(fullName);
  const existingEmails = new Set(existingUsers.map((u) => u.email.toLowerCase()));

  let candidate = `${base}@${COMPANY_EMAIL_DOMAIN}`;
  let suffix = 1;
  while (existingEmails.has(candidate)) {
    suffix += 1;
    candidate = `${base}${suffix}@${COMPANY_EMAIL_DOMAIN}`;
  }
  return candidate;
}

/**
 * The one place the frontend defines the default temporary password —
 * Create User's suggested value and Admin Reset Password's displayed value
 * both come from here. The backend has its own matching constant
 * (Backend/src/shared/constants/password.constants.ts) that actually hashes
 * and sets this value for Reset Password; keep the two literal values equal
 * if this ever changes, since there is no live network call to keep them
 * in sync automatically.
 */
export const DEFAULT_TEMP_PASSWORD = "Welcome@123";

/**
 * Standard temporary password issued to every newly created or reset
 * account — a fixed, friendly template (matching the PMO's own onboarding
 * convention) rather than a randomly generated string, since the employee
 * is always required to replace it on first login anyway.
 */
export function generateTemporaryPassword(): string {
  return DEFAULT_TEMP_PASSWORD;
}
