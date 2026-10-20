import { randomUUID } from "node:crypto";
import { env } from "../../../shared/utils/env.js";
import { sendEmail } from "../../../shared/email/email.service.js";
import type { SendEmailOptions, SendEmailResult } from "../../../shared/email/email.types.js";
import * as repo from "../repository/missingExpense.repository.js";
import { displayRunStatus, manualPeriodKey, STALE_RUN_MS, weeklyPeriodKey } from "../missingExpense.rules.js";
import { totalPagesFor, type Page } from "../weeklyPaging.js";

/**
 * One weekly-notification run lifecycle, shared by every weekly email
 * (Projects Missing Other Project Expenses, Invoices Unpaid 30+ Days).
 *
 * ScheduledJobRun's unique (jobName, periodKey) row is both the cross-process
 * lock and the "already sent this period" record: RUNNING -> SENDING ->
 * SENT | FAILED; NO_MISSING (nothing to report) and DISABLED (delivery off)
 * end a run without sending; a send interrupted mid-way becomes
 * DELIVERY_UNKNOWN and is never re-sent automatically. Manual runs share a
 * 10-minute key (manualPeriodKey) so simultaneous requests send once.
 */

export type WeeklySender = (options: SendEmailOptions) => Promise<SendEmailResult>;

export type JobOutcome =
  | { outcome: "sent" | "no_missing" | "disabled" | "failed"; runId: string; periodKey: string; eligibleCount: number; missingCount: number; error?: string }
  | { outcome: "skipped"; reason: "already_completed" | "in_progress" | "delivery_unknown"; periodKey: string; runId?: string };

export interface RunOptions {
  trigger: "scheduled" | "manual";
  now?: Date;
  /** Weekly key override (tests). Manual runs use the shared 10-minute manual key (manualPeriodKey). */
  periodKey?: string;
}

export interface WeeklyJobSpec<R> {
  jobName: string;
  logPrefix: string;
  /** Name of the env switch, for log messages. */
  emailFlagName: string;
  /** `now` is the run's clock (the period being reported). */
  buildReport(now: Date): Promise<R>;
  /** eligibleCount = items checked; matchCount = items listed in the email (0 = no email). */
  counts(report: R): { eligibleCount: number; matchCount: number };
  resolveRecipients(): Promise<{ to: string; cc: string[] }>;
  isEmailEnabled(): boolean;
  render(report: R, now: Date): { subject: string; html: string; text: string };
  sender(): WeeklySender | null; // null = the real sendEmail
  noun: string; // e.g. "project(s) missing Other Project Expenses"
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

/**
 * Claims the run row for (job, period); `skip` = another process owns it or it is already done.
 * Staleness is judged against the REAL current time, never an injected `now` (which only picks the period).
 */
async function claimRun(jobName: string, periodKey: string, trigger: string, claimToken: string): Promise<{ id: string } | { skip: JobOutcome }> {
  try {
    return await repo.createRun({ jobName, periodKey, trigger, claimToken });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }
  const existing = await repo.findRun(jobName, periodKey);
  if (!existing) return { skip: { outcome: "skipped", reason: "in_progress", periodKey } };
  const staleBefore = new Date(Date.now() - STALE_RUN_MS);
  const skip = (reason: "already_completed" | "in_progress" | "delivery_unknown") => ({ skip: { outcome: "skipped" as const, reason, periodKey, runId: existing.id } });

  switch (existing.status) {
    case "FAILED":
      // The mail server rejected the previous attempt — nothing was delivered, so a retry is safe.
      return (await repo.reclaimRun(existing.id, "FAILED", claimToken)) ? { id: existing.id } : skip("in_progress");
    case "RUNNING":
      if (existing.startedAt < staleBefore && (await repo.reclaimRun(existing.id, "RUNNING", claimToken, staleBefore))) return { id: existing.id };
      return skip("in_progress");
    case "SENDING":
      // A send may have reached the mail server — never re-send automatically.
      if (existing.updatedAt < staleBefore) await repo.markDeliveryUnknown(existing.id, staleBefore);
      return skip(existing.updatedAt < staleBefore ? "delivery_unknown" : "in_progress");
    case "DELIVERY_UNKNOWN":
      return skip("delivery_unknown");
    default: // SENT, NO_MISSING, DISABLED
      return skip("already_completed");
  }
}

/**
 * Runs the check once. Never throws: every failure is logged and recorded on
 * the run row so the scheduler keeps running and an admin can retry.
 */
export async function runWeeklyJob<R>(spec: WeeklyJobSpec<R>, options: RunOptions): Promise<JobOutcome> {
  const LOG = spec.logPrefix;
  const now = options.now ?? new Date();
  const periodKey = options.trigger === "manual" ? manualPeriodKey(now) : (options.periodKey ?? weeklyPeriodKey(now, env.APP_TIMEZONE));
  const claimToken = randomUUID();

  let runId: string;
  try {
    const claim = await claimRun(spec.jobName, periodKey, options.trigger, claimToken);
    if ("skip" in claim) {
      console.log(`${LOG} Run ${periodKey} skipped — ${claim.skip.outcome === "skipped" ? claim.skip.reason : ""}.`);
      return claim.skip;
    }
    runId = claim.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} Could not claim run ${periodKey}: ${message}`);
    return { outcome: "skipped", reason: "in_progress", periodKey };
  }

  let eligibleCount = 0;
  let missingCount = 0;
  try {
    const report = await spec.buildReport(now);
    ({ eligibleCount, matchCount: missingCount } = spec.counts(report));

    if (missingCount === 0) {
      await repo.transitionRun(runId, claimToken, "RUNNING", { status: "NO_MISSING", eligibleCount, missingCount, finished: true });
      console.log(`${LOG} Run ${periodKey} (${options.trigger}): ${eligibleCount} checked, 0 ${spec.noun} — no email sent.`);
      return { outcome: "no_missing", runId, periodKey, eligibleCount, missingCount };
    }

    const recipients = await spec.resolveRecipients();
    const recipientCount = 1 + recipients.cc.length;

    if (!spec.isEmailEnabled()) {
      await repo.transitionRun(runId, claimToken, "RUNNING", { status: "DISABLED", eligibleCount, missingCount, recipientCount, finished: true });
      console.log(`${LOG} Run ${periodKey} (${options.trigger}): ${eligibleCount} checked, ${missingCount} ${spec.noun} — email delivery is disabled (${spec.emailFlagName} is not "true"); nothing sent.`);
      return { outcome: "disabled", runId, periodKey, eligibleCount, missingCount };
    }

    if (!(await repo.transitionRun(runId, claimToken, "RUNNING", { status: "SENDING", eligibleCount, missingCount, recipientCount }))) {
      console.warn(`${LOG} Run ${periodKey} lost its claim before sending — not sending.`);
      return { outcome: "skipped", reason: "in_progress", periodKey, runId };
    }

    const email = spec.render(report, now);
    let result: SendEmailResult;
    try {
      result = await (spec.sender() ?? sendEmail)({ to: recipients.to, cc: recipients.cc, subject: email.subject, html: email.html, text: email.text });
    } catch (err) {
      result = { success: false, error: err instanceof Error ? err.message : String(err) };
    }

    if (result.success) {
      // The owner (claimToken) records the real outcome even if a peer meanwhile marked the send DELIVERY_UNKNOWN.
      await repo.transitionRun(runId, claimToken, ["SENDING", "DELIVERY_UNKNOWN"], { status: "SENT", error: null, finished: true });
      console.log(`${LOG} Run ${periodKey} (${options.trigger}): sent 1 email (To + ${recipients.cc.length} CC) listing ${missingCount} of ${eligibleCount} checked.`);
      return { outcome: "sent", runId, periodKey, eligibleCount, missingCount };
    }
    const error = result.error ?? "The mail server rejected the message.";
    await repo.transitionRun(runId, claimToken, ["SENDING", "DELIVERY_UNKNOWN"], { status: "FAILED", error, finished: true });
    console.error(`${LOG} Run ${periodKey} (${options.trigger}): email delivery FAILED — ${error.replace(/\.+$/, "")}. The run can be retried safely.`);
    return { outcome: "failed", runId, periodKey, eligibleCount, missingCount, error };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await repo.transitionRun(runId, claimToken, "RUNNING", { status: "FAILED", eligibleCount, missingCount, error, finished: true }).catch(() => undefined);
    console.error(`${LOG} Run ${periodKey} (${options.trigger}) failed before sending: ${error}`);
    return { outcome: "failed", runId, periodKey, eligibleCount, missingCount, error };
  }
}

type RunRow = Awaited<ReturnType<typeof repo.findRecentRuns>>[number];

/**
 * True only when "Retry this week's run" (POST /run mode=retry-weekly) would
 * safely re-run THIS row: manual runs are enabled, it is the current week's
 * scheduled run, and nothing was delivered (FAILED, or INTERRUPTED before
 * sending — claimRun reclaims exactly those). DELIVERY_UNKNOWN is never
 * retryable: the email may already have been delivered.
 */
function isRetryable(r: RunRow, status: string, now: Date, manualTriggerEnabled: boolean): boolean {
  return (
    manualTriggerEnabled &&
    r.trigger === "scheduled" &&
    r.periodKey === weeklyPeriodKey(now, env.APP_TIMEZONE) &&
    (status === "FAILED" || status === "INTERRUPTED")
  );
}

function runView(r: RunRow, now: Date, manualTriggerEnabled: boolean) {
  const status = displayRunStatus(r.status, r.updatedAt, now);
  return {
    id: r.id,
    periodKey: r.periodKey,
    trigger: r.trigger,
    status,
    attempts: r.attempts,
    eligibleCount: r.eligibleCount,
    missingCount: r.missingCount,
    recipientCount: r.recipientCount,
    error: r.error,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    retryable: isRetryable(r, status, now, manualTriggerEnabled),
  };
}
export type RunView = ReturnType<typeof runView>;

/**
 * Database filter for a status AS DISPLAYED (displayRunStatus): a RUNNING /
 * SENDING row untouched for STALE_RUN_MS shows as INTERRUPTED /
 * DELIVERY_UNKNOWN, so filtering matches exactly what each row displays.
 */
export function displayStatusWhere(status: string, now: Date): repo.RunWhere {
  const staleBefore = new Date(now.getTime() - STALE_RUN_MS);
  switch (status) {
    case "RUNNING":
      return { status: "RUNNING", updatedAt: { gte: staleBefore } };
    case "INTERRUPTED":
      return { status: "RUNNING", updatedAt: { lt: staleBefore } };
    case "SENDING":
      return { status: "SENDING", updatedAt: { gte: staleBefore } };
    case "DELIVERY_UNKNOWN":
      return { OR: [{ status: "DELIVERY_UNKNOWN" }, { status: "SENDING", updatedAt: { lt: staleBefore } }] };
    default:
      return { status };
  }
}

/** The newest run (for the Settings card's one-line summary) and how many runs exist. */
export async function lastRunView(jobName: string, now: Date, manualTriggerEnabled: boolean) {
  const [latest, totalRuns] = await Promise.all([repo.findRecentRuns(jobName, 1), repo.countRuns(jobName)]);
  return { lastRun: latest[0] ? runView(latest[0], now, manualTriggerEnabled) : null, totalRuns };
}

/** Run history, newest first, one page at a time, optionally filtered by displayed status and trigger. */
export async function runHistoryView(
  jobName: string,
  query: { page: number; pageSize: number; status?: string | undefined; trigger?: string | undefined },
  now: Date,
  manualTriggerEnabled: boolean
): Promise<Page<RunView>> {
  const where: repo.RunWhere = {
    ...(query.status ? displayStatusWhere(query.status, now) : {}),
    ...(query.trigger ? { trigger: query.trigger } : {}),
  };
  const { total, rows } = await repo.findRunsPage(jobName, where, (query.page - 1) * query.pageSize, query.pageSize);
  return {
    items: rows.map((r) => runView(r, now, manualTriggerEnabled)),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: totalPagesFor(total, query.pageSize),
  };
}
