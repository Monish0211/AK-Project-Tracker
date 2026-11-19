import { utcToZonedWallClock } from "./projectTimeZone";

/**
 * Snooze target (pure, testable). Snooze creates a NEW reminder (the original stays untouched as history) whose local date + time the server stores in the project
 * country's zone, so the target must be expressed in that SAME zone. `timeZone` is the project's zone; null only when the project has no country (then the server stores
 * no zone either, and the viewer's clock is used, as before).
 *
 *  - "5m" / "10m" / "30m" / "1h": the exact moment now + that duration, written as the project's local date and time (to the minute).
 *  - "tomorrow": tomorrow in the PROJECT's calendar, at the reminder's own local time.
 */
export type SnoozeOption = "5m" | "10m" | "30m" | "1h" | "tomorrow";

export const SNOOZE_MINUTES: Record<Exclude<SnoozeOption, "tomorrow">, number> = { "5m": 5, "10m": 10, "30m": 30, "1h": 60 };

const pad2 = (n: number): string => String(n).padStart(2, "0");

export function snoozeTarget(reminderTime: string, option: SnoozeOption, now: Date, timeZone: string | null): { date: string; time: string } {
  if (option === "tomorrow") {
    if (timeZone) {
      const [y, m, d] = utcToZonedWallClock(now, timeZone).date.split("-").map(Number);
      const next = new Date(Date.UTC(y, m - 1, d + 1));
      return { date: `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`, time: reminderTime };
    }
    const [h, mi] = reminderTime.split(":").map(Number);
    const target = new Date(now);
    target.setDate(target.getDate() + 1);
    target.setHours(h || 0, mi || 0, 0, 0);
    return { date: `${target.getFullYear()}-${pad2(target.getMonth() + 1)}-${pad2(target.getDate())}`, time: `${pad2(target.getHours())}:${pad2(target.getMinutes())}` };
  }
  const target = new Date(now.getTime() + SNOOZE_MINUTES[option] * 60_000);
  if (timeZone) return utcToZonedWallClock(target, timeZone);
  return { date: `${target.getFullYear()}-${pad2(target.getMonth() + 1)}-${pad2(target.getDate())}`, time: `${pad2(target.getHours())}:${pad2(target.getMinutes())}` };
}
