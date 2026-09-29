/**
 * Other Project Expenses — approved category list (Sept 2026 category
 * refresh). Replaces the old 11-value list (Flight Tickets, Hotel
 * Accommodation, Travel Allowance, Courier / Shipping, Consultancy Fee, Cab
 * Expenses, Food Expenses, Equipment Rental, Software License, Miscellaneous)
 * everywhere a user picks a category going forward.
 *
 * Existing ProjectExpense rows already stored with an old category string are
 * NOT migrated or rewritten by this change — `category` is a free-text
 * column, not an enum/FK, so old values remain exactly as stored. See
 * `isKnownExpenseCategory()` below for the safe-display rule that keeps a
 * legacy value visible instead of silently disappearing from an edit form.
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

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export function isKnownExpenseCategory(category: string): category is ExpenseCategory {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(category);
}
