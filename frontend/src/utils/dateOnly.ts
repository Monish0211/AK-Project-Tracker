/**
 * Date-only values (a project's start / end date) without any timezone arithmetic.
 *
 * The backend stores a date typed as "2026-11-11" at UTC midnight and returns it as "2026-11-11T00:00:00.000Z". A <input type="date"> only accepts "YYYY-MM-DD" and shows
 * an ISO timestamp as an EMPTY box, so every screen that fills a form from a stored value has to cut the date part off first. This does it by reading the characters
 * (never `new Date(...)` + local getters), so the day can never move by one in a timezone behind or ahead of UTC.
 */

const ISO_DATE_PART = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/;

/** "2026-11-11T00:00:00.000Z" or "2026-11-11" -> "2026-11-11"; anything else (empty, null, not a date) -> "" so a missing date stays blank and is never replaced by today. */
export function toDateOnly(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  const m = ISO_DATE_PART.exec(value.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** The date as the PMO screens write it ("11 Nov 2026"), or "—" when there is none. Reads the characters, so there is no timezone shift. */
export function formatDateOnly(value: string | null | undefined): string {
  const iso = toDateOnly(value);
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  const month = MONTHS[Number(m) - 1];
  return month ? `${d} ${month} ${y}` : "—";
}
