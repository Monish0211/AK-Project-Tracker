/**
 * Other Project Expenses — Excel Import category mapping (Sept 2026).
 *
 * Approved category list — see frontend/src/types/expenseCategories.ts for
 * the byte-for-byte identical dropdown list. Kept as a separate constant
 * here (not imported cross-package) since backend and frontend build
 * independently in this repo; both must be updated together if this list
 * ever changes.
 */
export const EXPENSE_CATEGORIES = [
  "Miscellaneous Expenses",
  "Staff Welfare - Insurance",
  "LD (Other Clients)",
  "Postage and Courier",
  "Printing & Stationery",
  "Project Expenses-GEM",
  "Tender Expenses",
  "Consultancy Expenses-Domestic",
  "Consultant Expenses (Monthly)",
  "Domestic - Travel Expenses",
  "Foreign - Travel Expenses",
  "Temporary Salaries (Project)",
  "Bank Charges (LC /BG)",
  "Incentive",
] as const;

export const MISCELLANEOUS_EXPENSES_CATEGORY = "Miscellaneous Expenses";

/**
 * Explicit Particulars -> category mapping, approved during the design
 * review. Deliberately does NOT include "Consultancy Fees" or "Consultancy
 * Fees - Foreign" — those two are still ambiguous pending an explicit
 * business decision (see PENDING_CATEGORY_DECISION_PARTICULARS below) and
 * must never be silently routed anywhere, including the Miscellaneous
 * Expenses fallback, until that decision is made.
 *
 * "Insurance" -> "Staff Welfare - Insurance" approved 2026-09-29 — applies
 * only to future uploads; no historical ProjectExpense rows (manual or
 * previously-imported) are touched or reprocessed by this change.
 */
export const PARTICULARS_TO_CATEGORY: Record<string, (typeof EXPENSE_CATEGORIES)[number]> = {
  "Domestic - Travel Expenses": "Domestic - Travel Expenses",
  "Foreign - Travel Expenses": "Foreign - Travel Expenses",
  "Consultancy Expenses-Domestic": "Consultancy Expenses-Domestic",
  Insurance: "Staff Welfare - Insurance",
};

/**
 * Known-but-ambiguous Particulars values (found in the audited "PR 12 series"
 * workbook) that must NOT be silently mapped anywhere — neither to an
 * explicit category nor to the Miscellaneous Expenses fallback. A transaction
 * row whose Particulars exactly matches one of these (case-sensitive, same
 * as every other match in this table) is reported as "pending category
 * decision" and excluded from import, distinct from both "mapped" and
 * "unknown -> Miscellaneous Expenses". This is intentionally a strict,
 * hardcoded set, not a heuristic — expanding or resolving it is a business
 * decision, not something this importer infers.
 */
export const PENDING_CATEGORY_DECISION_PARTICULARS = new Set<string>([
  "Consultancy Fees",
  "Consultancy Fees - Foreign",
]);

export type CategoryMappingOutcome =
  | { kind: "mapped"; category: (typeof EXPENSE_CATEGORIES)[number] }
  | { kind: "fallback"; category: typeof MISCELLANEOUS_EXPENSES_CATEGORY }
  | { kind: "pendingDecision" };

/**
 * Resolves a raw Particulars string to an import outcome. Never invents a
 * mapping for a value in PENDING_CATEGORY_DECISION_PARTICULARS — that set is
 * checked FIRST, before the generic "anything not in the table falls back to
 * Miscellaneous Expenses" rule, specifically so it is never conflated with a
 * genuinely unrecognized value.
 */
export function mapParticularsToCategory(rawParticulars: string): CategoryMappingOutcome {
  const trimmed = rawParticulars.trim();
  if (PENDING_CATEGORY_DECISION_PARTICULARS.has(trimmed)) {
    return { kind: "pendingDecision" };
  }
  const mapped = PARTICULARS_TO_CATEGORY[trimmed];
  if (mapped) {
    return { kind: "mapped", category: mapped };
  }
  return { kind: "fallback", category: MISCELLANEOUS_EXPENSES_CATEGORY };
}
