/**
 * Project-country time zones (Project Workspace reminders), browser side.
 *
 * A reminder's date and time are the PROJECT's local wall-clock time in its country's IANA zone (chosen by the server from the project's stored country and returned as
 * `timeZone`, with the exact UTC instant as `dueAt`). Nothing here uses the viewer's own time zone except for a reminder saved before this change (no `timeZone`), which keeps
 * its old behaviour so it is never shifted. Conversions use the IANA data built into Intl, so daylight saving is handled where a zone observes it.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** The country label of each zone in use, for "10:00 AM · Qatar time". */
const ZONE_LABEL: Record<string, string> = {
  "Asia/Kolkata": "India",
  "Asia/Kuala_Lumpur": "Malaysia",
  "Asia/Muscat": "Oman",
  "Asia/Dubai": "UAE",
  "Asia/Qatar": "Qatar",
};

/** One formatter per zone, reused: building an Intl.DateTimeFormat is far more expensive than using one (measured: ~0.4 ms per reminder rendered without this). */
const OFFSET_FORMATTERS = new Map<string, Intl.DateTimeFormat>();
const WALL_FORMATTERS = new Map<string, Intl.DateTimeFormat>();
function offsetFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = OFFSET_FORMATTERS.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    OFFSET_FORMATTERS.set(timeZone, f);
  }
  return f;
}
function wallFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = WALL_FORMATTERS.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    WALL_FORMATTERS.set(timeZone, f);
  }
  return f;
}

function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = offsetFormatter(timeZone).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - Math.floor(instant / 1000) * 1000;
}

/** The UTC instant of a local date ("YYYY-MM-DD") + time ("HH:mm") in `timeZone`. Gap times resolve just after the gap; ambiguous times to the first occurrence. */
export function zonedWallClockToUtc(date: string, time: string, timeZone: string): Date {
  const d = DATE_RE.exec(date);
  const t = TIME_RE.exec(time || "00:00");
  if (!d || !t) return new Date(NaN);
  const wall = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  const before = wall - zoneOffsetMs(wall - 86_400_000, timeZone);
  const after = wall - zoneOffsetMs(wall + 86_400_000, timeZone);
  // The candidate instants are the wall time read with the offset in force a day before and a day after (identical unless the offset changes nearby).
  const valid = [before, after].filter((c) => c + zoneOffsetMs(c, timeZone) === wall).sort((a, b) => a - b);
  // Ambiguous (fall-back overlap): the first occurrence. Non-existent (spring-forward gap): read with the offset before the gap, i.e. just after it.
  return new Date(valid.length > 0 ? valid[0]! : before);
}

/**
 * Daylight-saving validation policy (explicit, the same in the browser and on the server):
 *  - "nonexistent": the local time falls in a spring-forward gap. It is REJECTED; the user must choose another time (never silently moved).
 *  - "ambiguous": the local time occurs twice (fall-back overlap). It is accepted and means its FIRST occurrence.
 * None of the seven project countries currently observes daylight saving, so for them this is always null.
 */
export function localTimeIssue(date: string, time: string, timeZone: string): "nonexistent" | "ambiguous" | null {
  const d = DATE_RE.exec(date);
  const t = TIME_RE.exec(time || "00:00");
  if (!d || !t) return null;
  const wall = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  const valid = new Set([wall - zoneOffsetMs(wall - 86_400_000, timeZone), wall - zoneOffsetMs(wall + 86_400_000, timeZone)].filter((c) => c + zoneOffsetMs(c, timeZone) === wall));
  if (valid.size === 0) return "nonexistent";
  return valid.size > 1 ? "ambiguous" : null;
}

/** The local date ("YYYY-MM-DD") and time ("HH:mm") of `instant` in `timeZone`. */
export function utcToZonedWallClock(instant: Date, timeZone: string): { date: string; time: string } {
  const parts = wallFormatter(timeZone).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** "Qatar time" for Asia/Qatar, "UAE time" for Asia/Dubai (Abu Dhabi and FZE share it). Labelled by the zone, so it reads the same everywhere. */
export function zoneLabel(timeZone: string | null | undefined, country?: string | null): string {
  if (!timeZone) return "";
  return `${ZONE_LABEL[timeZone] || country?.trim() || timeZone} time`;
}

/** Today's date in `timeZone` ("YYYY-MM-DD"). */
export const zonedToday = (timeZone: string, now: Date = new Date()): string => utcToZonedWallClock(now, timeZone).date;
