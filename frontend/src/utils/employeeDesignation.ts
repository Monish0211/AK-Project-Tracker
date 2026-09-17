/**
 * Aug 2026 — shared "eligible manager/lead" designation rule, used by both
 * ProjectLeadershipCard.tsx (Primary/Secondary Project Manager) and
 * QuantityCard.tsx's AssignedToInput (Quantity Assigned To), so the two
 * fields can never silently drift onto two different eligibility rules.
 *
 * `designation` is free text in the Employee table (no enum, no dedicated
 * role field) — this matches on "Manager" or "Lead" appearing as a whole
 * word, case/spacing-insensitive, against the REAL designation strings
 * currently in use (e.g. "Senior Manager - Project and Proposals",
 * "Assistant Manager -IT Support", "Lead Engineer - Mechanical", "Lead
 * Technical safety Engineer"). Deliberately does NOT match "Senior
 * Engineer", "Principal Process Engineer", "HOD - ...", etc. — those are
 * NOT in the approved eligible list (Manager / Senior Manager / Assistant
 * Manager / Team Lead / Lead); see the Phase 1 audit report for the full
 * set of designation values found and why HOD was left out pending an
 * explicit decision.
 */
export function isEligibleManagerDesignation(designation: string | undefined | null): boolean {
  if (!designation) return false;
  return /\b(manager|lead)\b/i.test(designation);
}
