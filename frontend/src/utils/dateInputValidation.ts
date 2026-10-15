/**
 * Strict date-input check (Oct 2026) — the frontend twin of the backend's
 * Backend/src/shared/utils/dateInput.ts, same formats and same year range.
 *
 * A native <input type="date"> lets users TYPE the year, and Chrome accepts
 * up to six digits there ("20226-04-01"). The backend now rejects such a
 * value with a 400; checking it here first shows the message next to the
 * field instead. The value itself is never changed — invalid input is
 * reported, not "fixed".
 */
export const DATE_INPUT_MIN = "1900-01-01";
export const DATE_INPUT_MAX = "2100-12-31";
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

// YYYY-MM-DD, optionally followed by a time (T or space), seconds,
// fractional seconds and a Z / ±hh:mm / ±hhmm offset — what the date inputs
// produce and what the API returns for stored dates.
const DATE_INPUT_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/** True for a real calendar date in range. Empty/undefined/null is "not entered" and passes — required-ness is checked separately. */
export function isValidDateInput(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  const text = value.trim();
  if (text === "") return true;
  const match = DATE_INPUT_RE.exec(text);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < MIN_YEAR || year > MAX_YEAR) return false;
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return false;
  if (match[4] !== undefined) {
    const seconds = match[6] !== undefined ? Number(match[6]) : 0;
    if (Number(match[4]) > 23 || Number(match[5]) > 59 || seconds > 59) return false;
  }
  return !Number.isNaN(new Date(text).getTime());
}

/** The message to show for an invalid entered date, or undefined when it is fine (or empty). */
export function dateInputError(label: string, value: string | null | undefined): string | undefined {
  return isValidDateInput(value)
    ? undefined
    : `${label} must be a valid date with a year between ${MIN_YEAR} and ${MAX_YEAR}.`;
}
