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
 * TIME NORMALIZATION RULE (Start Time / End Time identity component):
 *
 * Blank/null/undefined -> "" — this is the deliberate legacy-compatibility
 * anchor. Every TimesheetEntry row created before this feature existed has
 * no stored startTime/endTime (NULL in the database); every future row
 * whose source Excel genuinely has no Start Time/End Time column/value also
 * normalizes to "". Both cases collapse to the SAME "" component, so two
 * blank-time rows for the same employee/project/date/task still collapse
 * into one identity, exactly as the pre-existing 4-field identity already
 * did — this is what "preserve compatibility with the existing identity
 * behavior for legacy records" means in practice: it is not that old rows
 * are specially detected, it is that "no time info available" always
 * normalizes the same way, whether that absence comes from an old row or a
 * new one.
 *
 * A recognizable "H:MM", "HH:MM", "H:MM:SS", or "H:MM AM/PM" text value is
 * normalized to a zero-padded 24-hour "HH:MM" — seconds are dropped
 * entirely (never meaningful for distinguishing one work session from
 * another), and "09:00", "9:00", and "09:00:00" all collapse to the same
 * "09:00" component, so cosmetic formatting differences between two KEKA
 * exports of the same fact can never create a phantom new identity.
 *
 * A genuinely unparseable non-blank value (some KEKA export oddity) is kept
 * as its own trimmed/uppercased text — the SAME fallback philosophy
 * projectIdentityComponent() below already uses for an unparseable raw
 * project code: two different unparseable values must remain distinct
 * identities, never silently collapsed into one shared bucket.
 */
const TIME_OF_DAY_PATTERN = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM|am|pm)?$/;

export function normalizeTimeOfDay(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";

  const match = TIME_OF_DAY_PATTERN.exec(trimmed);
  if (!match) {
    return trimmed.toUpperCase();
  }

  const [, hourText, minuteText, meridiemText] = match;
  let hour = Number(hourText);
  const meridiem = meridiemText?.toUpperCase();
  if (meridiem === "PM" && hour < 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;

  return `${String(hour).padStart(2, "0")}:${minuteText}`;
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
 *
 * Start Time / End Time (normalized via normalizeTimeOfDay() above) were
 * added as the 5th/6th identity components specifically because the
 * previous 4-field identity could not distinguish two genuinely separate
 * KEKA work sessions on the same employee/project/date/task (e.g.
 * 09:00-13:00 and 14:00-18:30) from a duplicate/corrected re-send of the
 * SAME session — it collapsed both into one row, discarding the earlier
 * session's hours (confirmed against real KEKA data: 99% of a 9,495-hour
 * discrepancy across the historical export traced to exactly this pattern).
 * Two blank-time rows still collapse to one identity (both normalize to
 * ""), preserving the legacy 4-field identity's behavior for any row with
 * no time information — see normalizeTimeOfDay()'s own doc comment.
 *
 * KNOWN, DELIBERATELY UNRESOLVED LIMITATION: this identity has no way to
 * distinguish "the end time of an existing session was corrected" from "a
 * genuinely new, later session started" — changing either time value
 * changes the identity itself, so a time correction is always reconciled as
 * a new Created row alongside the original, never as an Updated row
 * replacing it. No heuristic is applied here to guess which case a given
 * repeat is — see this module's test suite for the passing/documented proof
 * of this exact behavior, and the Phase A.2 design analysis for why this was
 * deliberately not resolved by inventing an unapproved business rule.
 */
/**
 * The employee+project+date+task prefix identityKey() itself uses,
 * exported separately so the time-correction matching below (and its
 * tests) can group candidate existing rows by this SAME coarse identity
 * without duplicating the normalization rules.
 */
export function coarseIdentityKey(employeeNo: string, rawProjectCode: string, workDate: Date, task: string): string {
  return `${normalizeEmployeeNo(employeeNo)}||${projectIdentityComponent(rawProjectCode)}||${dateKey(workDate)}||${task.trim()}`;
}

export function identityKey(
  employeeNo: string,
  rawProjectCode: string,
  workDate: Date,
  task: string,
  startTime: string | null | undefined,
  endTime: string | null | undefined
): string {
  return `${coarseIdentityKey(employeeNo, rawProjectCode, workDate, task)}||${normalizeTimeOfDay(startTime)}||${normalizeTimeOfDay(endTime)}`;
}

/**
 * TIME-CORRECTION MATCHING (Phase B design, see the task's own analysis):
 *
 * The 6-field identityKey() above cannot tell "the end time of an existing
 * session was corrected" apart from "a genuinely new, later session
 * started" — changing either time value changes the identity itself. This
 * function is the deliberately narrow fix: it is ONLY ever consulted after
 * an exact 6-field match has already failed (see processTimesheetImport()),
 * and it only ever matches by genuine TIME-RANGE OVERLAP among rows already
 * known to share the same employee+project+date+task.
 *
 * Proven safe against every required case (not assumed):
 *  - Two genuinely separate, non-overlapping sessions on the same
 *    date/task (e.g. 09:00-13:00 and 14:00-18:00) never overlap — they stay
 *    two rows, regardless of how similar their hours are.
 *  - Back-to-back sessions that merely TOUCH (one ending exactly when the
 *    next starts, e.g. 09:00-13:00 then 13:00-17:00) do NOT count as
 *    overlapping (strict inequality both sides) — they stay separate too.
 *  - A start-only, end-only, or both-times correction (e.g. 09:00-13:00 ->
 *    09:05-13:00) always overlaps the row it corrects, and is matched.
 *  - If a row's incoming time range overlaps MORE THAN ONE existing
 *    candidate, that is treated as unresolvable ambiguity — never silently
 *    picked or merged — and the caller falls through to Created, leaving
 *    every existing candidate untouched (correctness over avoiding a
 *    duplicate, per the approved priority order).
 *  - A candidate (or the incoming row) with a blank/unrecognized time is
 *    NEVER matched here — a blank time carries no information to compare
 *    against a real range, so forcing a guess would occasionally merge
 *    two genuinely different facts with no way to detect it. This is a
 *    DELIBERATE non-fix, not an oversight: a legacy blank-time row later
 *    "corrected" by a real timed row for the same identity is left exactly
 *    as today's behavior (a second, separate row) — there is no safe way
 *    to infer they are the same session from the data available.
 *
 * Only ever reads the fields it needs (never Prisma-specific), so the
 * exact same real TimesheetEntry rows the service layer passes in, and the
 * plain fixtures this module's own tests use, both work unchanged.
 */
export interface TimeRangeCandidate {
  startTime: string | null | undefined;
  endTime: string | null | undefined;
}

function timeToMinutes(normalized: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(normalized);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA;
}

export function findTimeCorrectedEntry<T extends TimeRangeCandidate>(
  candidates: readonly T[],
  incomingStartTime: string | null | undefined,
  incomingEndTime: string | null | undefined
): T | undefined {
  const incomingStart = timeToMinutes(normalizeTimeOfDay(incomingStartTime));
  const incomingEnd = timeToMinutes(normalizeTimeOfDay(incomingEndTime));
  if (incomingStart === null || incomingEnd === null) return undefined;

  const overlapping = candidates.filter((candidate) => {
    const candidateStart = timeToMinutes(normalizeTimeOfDay(candidate.startTime));
    const candidateEnd = timeToMinutes(normalizeTimeOfDay(candidate.endTime));
    if (candidateStart === null || candidateEnd === null) return false;
    return rangesOverlap(incomingStart, incomingEnd, candidateStart, candidateEnd);
  });

  return overlapping.length === 1 ? overlapping[0] : undefined;
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
