/**
 * PMO Coordinator eligibility — pure rules, no I/O (unit-tested directly;
 * reused by the project picker and save-time validation in later phases).
 *
 * An entry is resolved to PMO Portal accounts by normalized email
 * (lower-cased, trimmed) — never by display name. Eligible only when it
 * resolves to EXACTLY ONE account that is active, not locked, and holds the
 * "Projects" module. Two accounts whose emails differ only by letter case
 * are "ambiguous": no account is picked, since choosing one would be a guess.
 */

export const PMO_COORDINATOR_STATUSES = [
  "eligible",
  "no_account",
  "ambiguous_account",
  "inactive",
  "locked",
  "no_projects_module",
] as const;

export type PmoCoordinatorStatus = (typeof PMO_COORDINATOR_STATUSES)[number];

export interface CoordinatorAccountFacts {
  id: string;
  fullName: string;
  isActive: boolean;
  accountLocked: boolean;
  hasProjectsModule: boolean;
}

export interface CoordinatorEligibility {
  status: PmoCoordinatorStatus;
  /** Every reason the single account is not eligible (empty when eligible or when there is no single account). */
  reasons: Exclude<PmoCoordinatorStatus, "eligible" | "no_account" | "ambiguous_account">[];
  /** The resolved account — only when exactly one account matches. */
  account: CoordinatorAccountFacts | null;
  matchingAccountCount: number;
}

/** Plain-language explanation shown in the picker popup and in save-time rejections. */
export const PMO_COORDINATOR_STATUS_MESSAGES: Record<PmoCoordinatorStatus, string> = {
  eligible: "Has an active PMO Portal account with Projects access.",
  no_account: "No PMO Portal account exists for this email yet. Ask an Administrator to create one.",
  ambiguous_account:
    "More than one PMO Portal account uses this email (differing only by letter case). An Administrator must resolve the duplicate.",
  inactive: "The PMO Portal account for this email is inactive.",
  locked: "The PMO Portal account for this email is locked.",
  no_projects_module: "The PMO Portal account for this email does not have access to the Projects module.",
};

export function normalizeCoordinatorEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * `status` is the first failing check in a fixed order (inactive, then
 * locked, then module), so the UI always shows one stable label; `reasons`
 * lists all of them.
 */
export function classifyCoordinatorEligibility(accounts: CoordinatorAccountFacts[]): CoordinatorEligibility {
  if (accounts.length === 0) {
    return { status: "no_account", reasons: [], account: null, matchingAccountCount: 0 };
  }
  if (accounts.length > 1) {
    return { status: "ambiguous_account", reasons: [], account: null, matchingAccountCount: accounts.length };
  }

  const account = accounts[0]!;
  const reasons: CoordinatorEligibility["reasons"] = [];
  if (!account.isActive) reasons.push("inactive");
  if (account.accountLocked) reasons.push("locked");
  if (!account.hasProjectsModule) reasons.push("no_projects_module");

  return { status: reasons[0] ?? "eligible", reasons, account, matchingAccountCount: 1 };
}
