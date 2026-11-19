/**
 * Project-country time zones (Project Workspace reminders).
 *
 * A reminder's date and time are the PROJECT's local wall-clock time: the zone comes from the project's stored country (Project.regionId -> Region), never from the user's
 * location, browser or the server. The local time is converted to one exact UTC instant for storage and scheduling. Conversions use the IANA data built into Intl, so a zone
 * with daylight saving is handled correctly (none of the seven countries currently observes it).
 *
 * The mapping is fixed by the business, keyed by the country's stored code (and name, as a fallback). A project with no country has no zone: nothing is guessed, and in
 * particular an unclassified project is never treated as India.
 */

const ZONE_BY_KEY: Record<string, string> = {
  india: "Asia/Kolkata",
  malaysia: "Asia/Kuala_Lumpur",
  oman: "Asia/Muscat",
  "abu-dhabi": "Asia/Dubai",
  "abu dhabi": "Asia/Dubai",
  fzi: "Asia/Dubai",
  fze: "Asia/Dubai",
  "elixir-qatar": "Asia/Qatar",
  "elixir qatar": "Asia/Qatar",
  qatar: "Asia/Qatar",
};

/** The IANA zone of a project's country, or null when the project has no (known) country. */
export function timeZoneForCountry(region: { code?: string | null; name?: string | null } | null | undefined): string | null {
  if (!region) return null;
  for (const key of [region.code, region.name]) {
    const zone = key ? ZONE_BY_KEY[key.trim().toLowerCase()] : undefined;
    if (zone) return zone;
  }
  return null;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

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

/** The zone's offset from UTC (ms) at `instant`. */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = offsetFormatter(timeZone).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * The UTC instant of a local wall-clock date ("YYYY-MM-DD") and time ("HH:mm") in `timeZone`. Daylight saving: a time that falls in a spring-forward gap resolves to the
 * equivalent instant just after the gap; an ambiguous fall-back time resolves to its first occurrence.
 */
export function zonedWallClockToUtc(date: string, time: string, timeZone: string): Date {
  const d = DATE_RE.exec(date);
  const t = TIME_RE.exec(time || "00:00");
  if (!d || !t) throw new Error(`Invalid local date/time: ${date} ${time}`);
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

/** The local wall-clock date and time of `instant` in `timeZone`. */
export function utcToZonedWallClock(instant: Date, timeZone: string): { date: string; time: string } {
  const parts = wallFormatter(timeZone).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}
