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

/** Sequential EMP-##### id, one higher than the current highest — falls back to EMP-10001 if none exist. */
export function generateEmployeeId(existingUsers: User[]): string {
  const highest = existingUsers.reduce((max, user) => {
    const match = user.employeeId.match(/(\d+)$/);
    if (!match) return max;
    return Math.max(max, Number(match[1]));
  }, 10000);

  return `EMP-${highest + 1}`;
}

/**
 * Standard temporary password issued to every newly created or reset
 * account — a fixed, friendly template (matching the PMO's own onboarding
 * convention) rather than a randomly generated string, since the employee
 * is always required to replace it on first login anyway.
 */
export function generateTemporaryPassword(): string {
  return "Welcome@123";
}
