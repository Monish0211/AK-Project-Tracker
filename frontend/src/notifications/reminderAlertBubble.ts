import type { FiredReminderDetail } from "./reminderSchedulerCore";

/**
 * What the PMO Assistant robot shows when reminders fire (Oct 2026).
 *
 * The robot used to POLL the pending reminders and re-alert every 5 minutes (and on every page load) for any reminder that was
 * due or overdue — so an old reminder that had already fired, been snoozed, or simply not been completed kept coming back.
 * It now reacts only to what the Reminder Scheduler actually fires, once per reminder occurrence (see reminderSchedulerCore.ts).
 */

export interface AlertBubble {
  header: string;
  body: string;
}

/** One bubble for a batch of just-fired reminders: the first one's title, and "(+n more)" for the rest. Null for an empty batch. */
export function buildAlertBubble(batch: FiredReminderDetail[]): AlertBubble | null {
  if (batch.length === 0) return null;
  const first = batch[0]!;
  const label = first.projectCode ? `PR ${first.projectCode} — ${first.title}` : first.title;
  const more = batch.length > 1 ? ` (+${batch.length - 1} more)` : "";
  return {
    header: batch.some((b) => b.isDueNow) ? "⚠ Reminder due now" : "⚠ Reminder",
    body: `${label}${more}`,
  };
}

/**
 * Remembers which occurrences have already been shown and passes through only new ones. Created once at module level, so a
 * second mounted robot, a re-mount, or a late replay of "recent fires" can never show or sound the same reminder twice.
 */
export function createAlertDeduper(maxRemembered = 500) {
  const seen: string[] = [];
  return {
    filter(batch: FiredReminderDetail[]): FiredReminderDetail[] {
      const fresh = batch.filter((b) => !seen.includes(b.key));
      for (const b of fresh) seen.push(b.key);
      if (seen.length > maxRemembered) seen.splice(0, seen.length - maxRemembered);
      return fresh;
    },
  };
}
