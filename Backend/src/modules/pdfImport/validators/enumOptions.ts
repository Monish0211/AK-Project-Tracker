/**
 * Backend-side copies of this app's actual valid-option lists — located by
 * direct repository inspection (Stage 4 Correction 2), not invented. Two
 * different reliability tiers exist and are called out per-constant below:
 *
 *  - durationUnit / paymentType duplicate a REAL, already-enforced backend
 *    Zod enum (Backend/src/modules/projects/validators/project.
 *    validators.ts:36,45,107,114) — low drift risk, this backend already
 *    agrees with itself on these two.
 *  - Every other field duplicates a FRONTEND-ONLY array or inline JSX
 *    option list — confirmed by direct inspection that the backend had
 *    ZERO enforcement of these 6 fields before this file existed (see
 *    project.validators.ts, which only does z.string().trim().min(1) for
 *    all of them). Duplicating them here is genuinely new territory: if
 *    the frontend list ever changes, this file must be updated too — there
 *    is no shared source to import from, confirmed no such shared module
 *    exists anywhere in this repo.
 */

// frontend/src/utils/createEmptyProject.ts:4-12
export const PR_CATEGORIES = ["India", "Malaysia", "Oman", "Abu Dhabi", "FZI", "Elixir Qatar", "Qatar"] as const;

// frontend/src/pages/Projects/components/GeneralInfoCard.tsx:25-30 — 4
// presets PLUS a literal "Others" option (line 446) that unlocks free text
// (lines 469-484). Department is NOT a true closed enum even on the
// frontend — see isPresetDepartment() below, which deliberately does not
// reject non-preset values the way the other 6 fields are rejected.
export const DEPARTMENT_PRESETS = ["Design Engineering Services", "Environment", "Risk Management", "Training"] as const;

// GeneralInfoCard.tsx:463-465
export const DOMESTIC_FOREIGN_OPTIONS = ["Domestic", "Foreign"] as const;

// GeneralInfoCard.tsx:510-515
export const WORK_ORDER_STATUS_OPTIONS = ["Received", "Yet to Receive", "Pending", "Closed", "Cancelled"] as const;

// GeneralInfoCard.tsx:537-543
export const PROJECT_STATUS_OPTIONS = ["Active", "Ongoing", "Not Started", "Completed", "On Hold", "Cancelled"] as const;

// GeneralInfoCard.tsx:780-782
export const CONTRACT_TYPE_OPTIONS = ["LUMP SUM", "ARC"] as const;

// frontend/src/pages/Projects/components/QuantityCard.tsx:49 — the LIVE,
// actually-imported list. Do NOT use frontend/src/data/currencies.ts — that
// file is confirmed orphaned/unused dead code (zero import sites anywhere
// in the frontend) with drifted values (it has GBP/SAR/KWD and is missing
// MYR); duplicating it here would duplicate a latent bug, not a source of
// truth. Note also: Currency has NO backend/Prisma representation at all
// today (Project has no currency column) — this list exists purely so a
// Claude-suggested currency value can be validated for internal
// consistency; it doesn't yet have anywhere to persist to server-side.
export const CURRENCY_OPTIONS = ["INR", "USD", "EUR", "AED", "MYR", "QAR", "OMR"] as const;

// Backend/src/modules/projects/validators/project.validators.ts:36,107 — a
// real, already-enforced backend Zod enum, duplicated here verbatim.
export const DURATION_UNIT_OPTIONS = ["Days", "Weeks", "Months"] as const;

// Backend/src/modules/projects/validators/project.validators.ts:45,114
export const PAYMENT_TYPE_OPTIONS = ["Single", "Multiple"] as const;

function isInList(value: string, list: readonly string[]): boolean {
  return list.includes(value);
}

export function isValidPrCategory(value: string): boolean {
  return isInList(value, PR_CATEGORIES);
}
export function isValidDomesticForeign(value: string): boolean {
  return isInList(value, DOMESTIC_FOREIGN_OPTIONS);
}
export function isValidWorkOrderStatus(value: string): boolean {
  return isInList(value, WORK_ORDER_STATUS_OPTIONS);
}
export function isValidProjectStatus(value: string): boolean {
  return isInList(value, PROJECT_STATUS_OPTIONS);
}
export function isValidContractType(value: string): boolean {
  return isInList(value, CONTRACT_TYPE_OPTIONS);
}
export function isValidCurrency(value: string): boolean {
  return isInList(value, CURRENCY_OPTIONS);
}
export function isValidDurationUnit(value: string): boolean {
  return isInList(value, DURATION_UNIT_OPTIONS);
}
export function isValidPaymentType(value: string): boolean {
  return isInList(value, PAYMENT_TYPE_OPTIONS);
}

/**
 * Department is deliberately NOT paired with a reject-on-mismatch
 * function, per Correction 2 — the real UI lets a user pick "Others" and
 * type anything, so a Claude-suggested value outside the 4 presets is a
 * legitimate free-text candidate, not an invalid enum value. The adapter
 * (Step 7) uses this only to decide whether to tag the value as a
 * recognized preset vs. free text for warning-message purposes — it never
 * blanks a non-preset Department value.
 */
export function isPresetDepartment(value: string): boolean {
  return isInList(value, DEPARTMENT_PRESETS);
}

/**
 * Shared helper for the 6 true-enum fields: a non-matching value is
 * treated exactly like "not found" — never coerced to the closest option,
 * never silently accepted as a new valid-looking value.
 */
export function enforceEnumOrNull(value: string | null | undefined, isValid: (v: string) => boolean): string | null {
  if (!value) return null;
  return isValid(value) ? value : null;
}
