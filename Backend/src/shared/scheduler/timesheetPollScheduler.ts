import cron from "node-cron";
import { env } from "../utils/env.js";
import type { PollResult } from "../../modules/mailIngestion/mailIngestion.types.js";

/**
 * Daily trigger for the EXISTING KEKA mailbox poll — this module never
 * re-implements Graph auth, Excel parsing, PR/employee matching, or
 * reconciliation. It only calls POST /internal/timesheets/poll, the exact
 * same protected endpoint any other caller (a manual curl, an external
 * cron) would use, over a loopback HTTP request so the real
 * verifyInternalSecret gate is exercised identically every time.
 *
 * Runs in-process because this app has no PM2/systemd/Docker supervisor
 * anywhere in the repo (confirmed by inspection — see server.ts, which
 * itself is just `tsx src/server.ts` with no process manager). That means:
 * if this Node process is down at 22:00 IST, nothing fires that day, and
 * nothing here can change that — it's a deployment-level gap, not
 * something an in-process scheduler can fix.
 */

let started = false;

function logPollResult(result: PollResult): void {
  console.log(
    `[TimesheetPollScheduler] Poll result — messagesFound=${result.messagesFound} processed=${result.processed} ` +
      `skippedAlreadyProcessed=${result.skippedAlreadyProcessed} skippedNoAttachment=${result.skippedNoAttachment} | ` +
      `created=${result.createdCount} updated=${result.updatedCount} unchanged=${result.unchangedCount} ` +
      `removed=${result.removedCount} failed=${result.failedCount}`
  );
  if (result.errors.length > 0) {
    console.warn(`[TimesheetPollScheduler] Poll reported ${result.errors.length} message-level error(s):`, result.errors);
  }
}

/**
 * Never throws — a Graph outage, a network failure, or an unexpected
 * exception here must never crash the backend and must never prevent
 * tomorrow's 22:00 run (node-cron simply calls this again on its own
 * schedule regardless of what happened this time).
 */
async function runDailyPoll(): Promise<void> {
  console.log(`[TimesheetPollScheduler] Daily KEKA poll starting at ${new Date().toISOString()}.`);

  if (!env.INTERNAL_POLL_SECRET) {
    console.error(
      "[TimesheetPollScheduler] Skipped — INTERNAL_POLL_SECRET is not set, so POST /internal/timesheets/poll would reject the call with 503. Set it in Backend/.env to enable the daily poll."
    );
    return;
  }

  try {
    const response = await fetch(`http://localhost:${env.PORT}/internal/timesheets/poll`, {
      method: "POST",
      headers: { "x-internal-secret": env.INTERNAL_POLL_SECRET },
    });

    const body = (await response.json().catch(() => null)) as { success?: boolean; data?: PollResult; message?: string } | null;

    if (!response.ok || !body?.success || !body.data) {
      console.error(`[TimesheetPollScheduler] Poll request failed (HTTP ${response.status}): ${body?.message ?? "Unknown error."}`);
      return;
    }

    logPollResult(body.data);
    console.log("[TimesheetPollScheduler] Daily KEKA poll finished.");
  } catch (err) {
    console.error("[TimesheetPollScheduler] Daily KEKA poll failed with an unexpected error:", err instanceof Error ? err.message : err);
  }
}

/**
 * Call exactly once, from server.ts, after the HTTP server starts
 * listening (the self-loopback fetch above needs the server already
 * accepting connections). Guarded so an accidental second call within the
 * same process registers only one cron job — tsx watch's dev-mode restart
 * always fully replaces the process (module state included), so this guard
 * is only insurance against a future double-call within one process, not
 * against hot-reload itself.
 */
export function startTimesheetPollScheduler(): void {
  if (started) {
    console.warn("[TimesheetPollScheduler] startTimesheetPollScheduler() called again in the same process — ignoring (already scheduled).");
    return;
  }
  started = true;

  cron.schedule(
    "0 22 * * *",
    () => {
      void runDailyPoll();
    },
    { timezone: "Asia/Kolkata" }
  );

  console.log("[TimesheetPollScheduler] Scheduled — daily KEKA poll will run at 22:00 Asia/Kolkata (cron expression: '0 22 * * *').");
}
