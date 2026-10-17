import cron from "node-cron";
import { env } from "../utils/env.js";
import { runMissingExpenseJob } from "../../modules/weeklyNotifications/index.js";

/**
 * Weekly "Projects Missing Other Project Expenses" email (Oct 2026). Same
 * in-process node-cron approach as timesheetPollScheduler.ts.
 *
 * Duplicate prevention does NOT rely on this process being the only one:
 * runMissingExpenseJob() claims a unique ScheduledJobRun row per ISO week
 * (jobName + "2026-W42") in the database, so a second worker, an overlapping
 * tick or a restart in the same week finds the row and does not send again.
 * Delivery itself is gated by MISSING_EXPENSE_EMAIL_ENABLED (default false).
 */

let started = false;

export function startMissingExpenseScheduler(): void {
  if (started) {
    console.warn("[MissingExpenseScheduler] startMissingExpenseScheduler() called again in the same process — ignoring (already scheduled).");
    return;
  }
  if (!cron.validate(env.MISSING_EXPENSE_CRON)) {
    console.error(`[MissingExpenseScheduler] Not scheduled — MISSING_EXPENSE_CRON "${env.MISSING_EXPENSE_CRON}" is not a valid cron expression.`);
    return;
  }
  started = true;

  cron.schedule(
    env.MISSING_EXPENSE_CRON,
    () => {
      void runMissingExpenseJob({ trigger: "scheduled" }).catch((err: unknown) => {
        // runMissingExpenseJob never throws by design; this is a last-resort guard so the scheduler keeps running.
        console.error("[MissingExpenseScheduler] Unexpected error:", err instanceof Error ? err.message : err);
      });
    },
    { timezone: env.APP_TIMEZONE }
  );

  console.log(
    `[MissingExpenseScheduler] Scheduled — weekly missing-expenses check at '${env.MISSING_EXPENSE_CRON}' (${env.APP_TIMEZONE}); ` +
      `email delivery ${env.MISSING_EXPENSE_EMAIL_ENABLED ? "ENABLED" : "disabled (MISSING_EXPENSE_EMAIL_ENABLED is not \"true\")"}.`
  );
}
