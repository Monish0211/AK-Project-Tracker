import { normalizeProjectCode } from "../../../shared/utils/projectCode.util.js";

/**
 * Pure Timesheet reconciliation decision logic — no Prisma, no I/O. Same
 * architectural role as timesheetPending.rules.ts: the DB-touching service
 * (timesheet.service.ts) calls these functions but owns every actual read/
 * write itself. Keeping the identity/outcome rules here, isolated from
 * Prisma, is what makes them exhaustively unit-testable without a database.
 *
 * ROOT CAUSE THIS FILE FIXES (Priority #5 — Keka Overlapping Daily Export
 * Duplicate): Keka's daily export legitimately re-sends prior days' rows —
 * that is expected, not a duplicate-file error, and the reconciliation
 * engine must treat a re-sent row as the SAME business fact every time. The
 * previous identityKey() embedded the row's RESOLVED projectId (or the
 * literal sentinel "UNASSIGNED") into the identity string. Since the same
 * Keka row can resolve differently across two imports — unresolved
 * (Project didn't exist yet) on one run, resolved on a later run, once the
 * matching Project is created — the two computed keys differed, so the
 * engine could never recognize the second import's row as "the same fact"
 * as the first, and created a second TimesheetEntry instead of updating the
 * first. Confirmed against real data: employee 0533 / PR 12006 / 20-Aug-2026
 * / "SIL-Verification Report preparation" existed as both an Unassigned row
 * (bed09dc4…) and a resolved row (a6fffd2a…) with identical hours (8.57) —
 * the last-run's OLD identityKey() correctly explains it, and 3 more
 * employees on the same PR 12006 import show the identical signature.
 *
 * THE FIX: identity is now built from the row's RAW project code
 * (rawProjectCode, normalized the same way project resolution itself
 * already normalizes it) instead of the resolved projectId. rawProjectCode
 * is stable across imports regardless of resolution outcome — schema.prisma
 * confirms it is "populated at creation time only, never re-derived/
 * overwritten later" — so the same Keka fact now produces the same key on
 * every import, whether or not its Project has been resolved yet. Deciding
 * whether an already-existing row's projectId itself needs updating (the
 * "was Unassigned, now resolves" transition) is a SEPARATE concern from
 * identity matching, handled by decideEntryOutcome() below.
 */

/** Same trim+lowercase normalization identity has always used for the employee dimension — unchanged by this fix (see the design note: the employee-resolution-transition case is a related but separately-tracked risk, out of scope for this fix). */
export function normalizeEmployeeNo(raw: string): string {
  return raw.trim().toLowerCase();
}

/** "YYYY-MM-DD" — workDate is always stored at UTC midnight, so UTC getters are correct here (same convention as projectResource.service.ts's own identical helper). */
export function dateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/**
 * The project component of the identity key. Uses the SAME
 * normalizeProjectCode() project resolution itself already relies on for
 * matching — never a second, competing normalization rule — so identity
 * matching can never disagree with what project-resolution would call "the
 * same code." Falls back to the raw, trimmed/uppercased text itself (not a
 * shared "UNASSIGNED" bucket) when the code doesn't parse into a PR code at
 * all, so two different genuinely-unparseable codes for the same employee/
 * date/task remain distinct identities rather than colliding.
 */
function projectIdentityComponent(rawProjectCode: string): string {
  const normalized = normalizeProjectCode(rawProjectCode);
  return normalized || `RAW:${rawProjectCode.trim().toUpperCase()}`;
}

/**
 * Resolution-independent identity — deliberately built ONLY from fields that
 * never change across two imports of the same fact (the employee number as
 * stored/typed, the raw project code as Keka sent it, the work date, the
 * task text). Never built from a resolved projectId, which is exactly what
 * made the previous identity unstable across the Unassigned→Resolved
 * transition.
 */
export function identityKey(employeeNo: string, rawProjectCode: string, workDate: Date, task: string): string {
  return `${normalizeEmployeeNo(employeeNo)}||${projectIdentityComponent(rawProjectCode)}||${dateKey(workDate)}||${task.trim()}`;
}

export interface ExistingEntrySnapshot {
  projectId: string | null;
  hours: number;
}

export interface IncomingEntryRow {
  projectId: string | null;
  hours: number;
}

export type EntryOutcome = "Created" | "Updated" | "Unchanged" | "Removed";

export interface EntryDecision {
  outcome: EntryOutcome;
  /** Whether the caller should write incoming.projectId onto the existing row. Never true for "Created" (the row is created with the resolved projectId directly) or "Removed" (the row is deleted, not updated). */
  writeProjectId: boolean;
  /** Whether the caller should write incoming.hours onto the existing row. Same "never true for Created/Removed" reasoning as writeProjectId. */
  writeHours: boolean;
}

/**
 * Pure outcome decision for one row once its identity match (or lack of
 * one) against existingMap is already known — the only thing
 * processTimesheetImport() still does itself is the actual Prisma read/
 * write and the row-log bookkeeping.
 *
 * `existing` is undefined when no row currently shares this row's identity
 * key (a genuinely new business fact — Rule 3). Otherwise this is the
 * previously-reconciled row for the exact same (employeeNo, rawProjectCode,
 * workDate, task) — regardless of what THAT row's own projectId currently
 * is.
 *
 * Hours are the VALUE being compared, never part of the identity (Rule 4)
 * — no threshold of any kind is applied to `incoming.hours` here, by
 * design: a legitimate Keka row can carry 8, 12, or 17 hours and none of
 * those numbers change which branch is taken, only whether hours equal the
 * previously-stored value.
 *
 * The Unassigned→Resolved link case (existing.projectId !== incoming.
 * projectId, i.e. a previously-null projectId now resolves, or — the same
 * mechanism, no special-casing needed — an already-resolved row now
 * resolves to a DIFFERENT project than before) is deliberately classified
 * by HOURS equality alone, per the confirmed business rule ("Existing hours
 * compared with incoming hours. If same → Unchanged. If different →
 * Updated."). This means a pure project-link with unchanged hours is
 * logged/counted as "Unchanged" even though the row's projectId really is
 * being written — a deliberate, confirmed choice (the alternative of
 * logging it as "Updated" was evaluated and explicitly not chosen), not an
 * oversight. writeProjectId still reports true in that case so the caller
 * knows to perform the write regardless of which outcome label is used for
 * the audit log/counters.
 */
export function decideEntryOutcome(existing: ExistingEntrySnapshot | undefined, incoming: IncomingEntryRow): EntryDecision {
  if (!existing) {
    // A row that never existed before, arriving with 0 hours, creates
    // nothing — there is no "removal" to represent. Matches the exact
    // pre-existing special case in processTimesheetImport().
    if (incoming.hours === 0) {
      return { outcome: "Unchanged", writeProjectId: false, writeHours: false };
    }
    return { outcome: "Created", writeProjectId: false, writeHours: false };
  }

  // A correction to 0 hours always removes the row — independent of
  // whether this row's project link would otherwise need updating, since
  // there is nothing left to link once it's deleted.
  if (incoming.hours === 0) {
    return { outcome: "Removed", writeProjectId: false, writeHours: false };
  }

  const projectNeedsLinking = existing.projectId !== incoming.projectId;

  if (existing.hours === incoming.hours) {
    // Rule: "If same → Unchanged" — even when a link is also happening.
    return { outcome: "Unchanged", writeProjectId: projectNeedsLinking, writeHours: false };
  }

  // Rule: "If different → Updated." The later Keka value always wins —
  // never added to the previous value (Rule 2's "NOT 17 + 19 = 36").
  return { outcome: "Updated", writeProjectId: projectNeedsLinking, writeHours: true };
}
