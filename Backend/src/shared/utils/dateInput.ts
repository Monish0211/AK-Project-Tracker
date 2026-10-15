import { z } from "zod";

/**
 * Strict date input for API bodies (Oct 2026).
 *
 * z.coerce.date() is not enough on its own: `new Date("20226-04-01")` is a
 * VALID JavaScript date (year 20226), so it passed validation and was stored
 * by PostgreSQL — but the database driver cannot read a five-digit year back
 * and returns an Invalid Date, which crashed GET /dashboard/summary
 * (toDateKey -> toISOString -> RangeError). `new Date("2026-02-30")` is also
 * accepted and silently rolled over to 2 March.
 *
 * This checks the ORIGINAL string first — shape, real calendar day, and a
 * year within MIN_DATE_YEAR..MAX_DATE_YEAR — and only then parses it with
 * `new Date(value)` exactly as before, so legitimate inputs keep their
 * existing timezone behavior ("YYYY-MM-DD" = UTC midnight; full ISO
 * timestamps keep their offset).
 */
export const MIN_DATE_YEAR = 1900;
export const MAX_DATE_YEAR = 2100;

// YYYY-MM-DD, optionally followed by a time (T or space), seconds,
// fractional seconds and a Z / ±hh:mm / ±hhmm offset.
const DATE_INPUT_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/** True for a real Date whose (UTC) year is within MIN_DATE_YEAR..MAX_DATE_YEAR. */
export function isWithinYearRange(date: Date): boolean {
  if (Number.isNaN(date.getTime())) return false;
  const year = date.getUTCFullYear();
  return year >= MIN_DATE_YEAR && year <= MAX_DATE_YEAR;
}

/** The parsed Date for a valid input, or null for anything malformed or out of range. */
export function parseStrictDateInput(value: unknown): Date | null {
  if (value instanceof Date) return isWithinYearRange(value) ? value : null;
  if (typeof value !== "string") return null;

  const text = value.trim();
  const match = DATE_INPUT_RE.exec(text);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < MIN_DATE_YEAR || year > MAX_DATE_YEAR) return null;
  if (month < 1 || month > 12) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return null;

  if (match[4] !== undefined) {
    const hours = Number(match[4]);
    const minutes = Number(match[5]);
    const seconds = match[6] !== undefined ? Number(match[6]) : 0;
    if (hours > 23 || minutes > 59 || seconds > 59) return null;
  }

  const parsed = new Date(text);
  return isWithinYearRange(parsed) ? parsed : null;
}

/**
 * Zod field for a date in a request body. Chain .optional() / .nullable()
 * exactly as with z.coerce.date() — undefined/null never reach the check.
 */
export function dateInput(label: string) {
  const message = `${label} must be a valid date (YYYY-MM-DD) with a year between ${MIN_DATE_YEAR} and ${MAX_DATE_YEAR}.`;
  return z.unknown().transform((value, ctx): Date => {
    const parsed = parseStrictDateInput(value);
    if (!parsed) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return parsed;
  });
}
