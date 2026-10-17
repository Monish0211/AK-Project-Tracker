import { randomUUID } from "node:crypto";
import { booleanFromEnv, env } from "../../../shared/utils/env.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { sendEmail } from "../../../shared/email/email.service.js";
import type { SendEmailOptions, SendEmailResult } from "../../../shared/email/email.types.js";
import { buildMissingOtherExpensesEmail } from "../../../shared/email/templates/missingOtherExpenses.template.js";
import * as repo from "../repository/missingExpense.repository.js";
import {
  buildMissingExpenseReport,
  DEFAULT_CC_EMAILS,
  DEFAULT_TO_EMAIL,
  displayRunStatus,
  formatReportTimestamp,
  manualPeriodKey,
  MISSING_EXPENSE_JOB_NAME,
  MISSING_EXPENSE_SETTING_KEY,
  MISSING_EXPENSE_SUBJECT,
  normalizeEmail,
  STALE_RUN_MS,
  UNRESOLVED_DEFAULT_CC,
  validateRecipients,
  weeklyPeriodKey,
  type CandidateProject,
  type MissingExpenseReport,
} from "../missingExpense.rules.js";

/**
 * Weekly "Projects Missing Other Project Expenses" email (Oct 2026).
 *
 * One consolidated email per weekly run to the configured To + CC recipients,
 * only when at least one eligible project has zero Other Project Expenses
 * records. Delivery is gated by MISSING_EXPENSE_EMAIL_ENABLED (default false);
 * the check itself always runs and is recorded in ScheduledJobRun, whose
 * unique (jobName, periodKey) row is both the cross-process lock and the
 * "already sent this week" record.
 */

const LOG = "[MissingExpenseNotification]";

// ── Test seams (same pattern as the PMO Coordinator allocation email) ───────

export type MissingExpenseSender = (options: SendEmailOptions) => Promise<SendEmailResult>;
let senderOverride: MissingExpenseSender | null = null;
let emailFlagOverride: boolean | null = null;
let manualFlagOverride: boolean | null = null;

/** Tests only: replace the real sender so nothing is ever delivered. Pass null to restore. */
export function setMissingExpenseSenderForTests(sender: MissingExpenseSender | null): void {
  senderOverride = sender;
}
/** Tests only: evaluate MISSING_EXPENSE_EMAIL_ENABLED as if set to `raw` (null = real env). */
export function setMissingExpenseEmailFlagForTests(raw: string | undefined | null): void {
  emailFlagOverride = raw === null ? null : booleanFromEnv.parse(raw);
}
/** Tests only: evaluate MISSING_EXPENSE_MANUAL_TRIGGER_ENABLED as if set to `raw` (null = real env). */
export function setMissingExpenseManualFlagForTests(raw: string | undefined | null): void {
  manualFlagOverride = raw === null ? null : booleanFromEnv.parse(raw);
}

export function isMissingExpenseEmailEnabled(): boolean {
  return emailFlagOverride ?? env.MISSING_EXPENSE_EMAIL_ENABLED;
}
export function isManualTriggerEnabled(): boolean {
  return manualFlagOverride ?? env.MISSING_EXPENSE_MANUAL_TRIGGER_ENABLED;
}

// ── Recipients ──────────────────────────────────────────────────────────────

export interface CcRecipientView {
  email: string;
  portalUserId: string | null;
  userName: string | null;
  userActive: boolean | null;
}

export interface RecipientsView {
  toEmail: string;
  cc: CcRecipientView[];
  /** true until an administrator first saves the settings. */
  isDefault: boolean;
  /** Requested default recipients with no matching PMO Portal user (never guessed). */
  unresolvedDefaults: string[];
  updatedAt: string | null;
  updatedBy: string | null;
}

export async function getRecipients(): Promise<RecipientsView> {
  const setting = await repo.findSetting(MISSING_EXPENSE_SETTING_KEY);
  if (setting) {
    return {
      toEmail: setting.toEmail,
      cc: setting.ccRecipients.map((c) => ({
        email: c.portalUser?.email ?? c.email,
        portalUserId: c.portalUserId,
        userName: c.portalUser?.fullName ?? null,
        userActive: c.portalUser ? c.portalUser.isActive : null,
      })),
      isDefault: false,
      unresolvedDefaults: [],
      updatedAt: setting.updatedAt.toISOString(),
      updatedBy: setting.updatedBy?.fullName ?? null,
    };
  }
  const users = await repo.findUsersByEmails(DEFAULT_CC_EMAILS.map(normalizeEmail));
  const byEmail = new Map(users.map((u) => [normalizeEmail(u.email), u]));
  return {
    toEmail: DEFAULT_TO_EMAIL,
    cc: DEFAULT_CC_EMAILS.map((email) => {
      const u = byEmail.get(normalizeEmail(email));
      return { email: u?.email ?? email, portalUserId: u?.id ?? null, userName: u?.fullName ?? null, userActive: u ? u.isActive : null };
    }),
    isDefault: true,
    unresolvedDefaults: [...UNRESOLVED_DEFAULT_CC],
    updatedAt: null,
    updatedBy: null,
  };
}

export interface UpdateRecipientsInput {
  toEmail: string;
  cc: { email?: string | undefined; portalUserId?: string | null | undefined }[];
}

/**
 * Saves the To address and the full CC list. A CC entry picked from PMO
 * Portal users carries portalUserId: its address is taken from that user's
 * stored record (the client-sent email is ignored), and the user must exist
 * and be active. Typed entries are validated as email addresses. Duplicates
 * (including a CC equal to the To address) are rejected.
 */
export async function updateRecipients(input: UpdateRecipientsInput, updatedByUserId: string): Promise<RecipientsView> {
  const userIds = [...new Set(input.cc.map((c) => c.portalUserId).filter((id): id is string => Boolean(id)))];
  const users = await repo.findUsersByIds(userIds);
  const userById = new Map(users.map((u) => [u.id, u]));

  const entries: { email: string; portalUserId: string | null }[] = [];
  for (const c of input.cc) {
    if (c.portalUserId) {
      const u = userById.get(c.portalUserId);
      if (!u) throw new AppError("A selected CC user no longer exists. Refresh and try again.", 400);
      if (!u.isActive) throw new AppError(`${u.email} is an inactive PMO Portal user and cannot be added as a CC recipient.`, 400);
      entries.push({ email: u.email, portalUserId: u.id });
    } else {
      entries.push({ email: (c.email ?? "").trim(), portalUserId: null });
    }
  }

  const checked = validateRecipients({ toEmail: input.toEmail, ccEmails: entries.map((e) => e.email) });
  if (!checked.ok) throw new AppError(checked.message, 400);
  if (entries.some((e) => !e.email)) throw new AppError("A CC recipient is missing an email address.", 400);

  await repo.saveSetting(
    MISSING_EXPENSE_SETTING_KEY,
    checked.toEmail,
    entries.map((e) => ({ email: e.email, emailNormalized: normalizeEmail(e.email), portalUserId: e.portalUserId })),
    updatedByUserId
  );
  console.log(`${LOG} Recipients updated by user ${updatedByUserId} — To + ${entries.length} CC.`);
  return getRecipients();
}

export async function listUserOptions() {
  const users = await repo.findActiveUsersForPicker();
  return users.map((u) => ({ id: u.id, fullName: u.fullName, email: u.email, role: u.role?.name ?? null }));
}

/** Addresses actually used for a send: linked users' current emails; inactive linked users are skipped. */
async function resolveSendRecipients(): Promise<{ to: string; cc: string[] }> {
  const view = await getRecipients();
  const cc: string[] = [];
  for (const c of view.cc) {
    if (c.portalUserId && c.userActive === false) {
      console.warn(`${LOG} Skipping CC ${c.email} — the linked PMO Portal user is inactive.`);
      continue;
    }
    cc.push(c.email);
  }
  return { to: view.toEmail, cc };
}

// ── Report ──────────────────────────────────────────────────────────────────

type CandidateSource = () => Promise<CandidateProject[]>;
let candidateSourceOverride: CandidateSource | null = null;

/** Tests only: replace the project source (the job's lock/run logic still uses the real database). Pass null to restore. */
export function setMissingExpenseCandidatesForTests(source: CandidateSource | null): void {
  candidateSourceOverride = source;
}

export async function buildReport(): Promise<MissingExpenseReport> {
  return buildMissingExpenseReport(await (candidateSourceOverride ?? repo.findCandidateProjects)());
}

export function projectUrl(projectId: string): string {
  return `${env.FRONTEND_URL.replace(/\/+$/, "")}/projects/view/${encodeURIComponent(projectId)}`;
}

export function renderReportEmail(report: MissingExpenseReport, now: Date) {
  return buildMissingOtherExpensesEmail({
    subject: MISSING_EXPENSE_SUBJECT,
    generatedAt: formatReportTimestamp(now, env.APP_TIMEZONE),
    eligibleCount: report.eligibleCount,
    projects: report.missing.map((p) => ({
      prNo: p.prNo,
      client: p.client,
      projectTitle: p.projectTitle,
      projectManager: p.projectManager,
      projectStatus: p.projectStatus,
      projectUrl: projectUrl(p.id),
    })),
  });
}

/** Read-only preview for Settings: counts, list, rendered email and recipients. Never sends, never records a run. */
export async function previewReport(now = new Date()) {
  const report = await buildReport();
  const email = renderReportEmail(report, now);
  const recipients = await resolveSendRecipients();
  return {
    eligibleCount: report.eligibleCount,
    missingCount: report.missing.length,
    projects: report.missing.map((p) => ({ ...p, projectUrl: projectUrl(p.id) })),
    subject: email.subject,
    html: email.html,
    text: email.text,
    recipients,
    wouldSend: report.missing.length > 0 && isMissingExpenseEmailEnabled(),
  };
}

// ── The job ─────────────────────────────────────────────────────────────────

export type JobOutcome =
  | { outcome: "sent" | "no_missing" | "disabled" | "failed"; runId: string; periodKey: string; eligibleCount: number; missingCount: number; error?: string }
  | { outcome: "skipped"; reason: "already_completed" | "in_progress" | "delivery_unknown"; periodKey: string; runId?: string };

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

/**
 * Claims the run row for (job, period); `skip` = another process owns it or it is already done.
 * Staleness is judged against the REAL current time, never an injected `now` (which only picks the period).
 */
async function claimRun(periodKey: string, trigger: string, claimToken: string): Promise<{ id: string } | { skip: JobOutcome }> {
  try {
    return await repo.createRun({ jobName: MISSING_EXPENSE_JOB_NAME, periodKey, trigger, claimToken });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }
  const existing = await repo.findRun(MISSING_EXPENSE_JOB_NAME, periodKey);
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

export interface RunOptions {
  trigger: "scheduled" | "manual";
  now?: Date;
  /** Weekly key override (tests). Manual runs use the shared 10-minute manual key (manualPeriodKey). */
  periodKey?: string;
}

/**
 * Runs the check once. Never throws: every failure is logged and recorded on
 * the run row so the scheduler keeps running and an admin can retry.
 */
export async function runMissingExpenseJob(options: RunOptions): Promise<JobOutcome> {
  const now = options.now ?? new Date();
  const periodKey = options.trigger === "manual" ? manualPeriodKey(now) : (options.periodKey ?? weeklyPeriodKey(now, env.APP_TIMEZONE));
  const claimToken = randomUUID();

  let runId: string;
  try {
    const claim = await claimRun(periodKey, options.trigger, claimToken);
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
    const report = await buildReport();
    eligibleCount = report.eligibleCount;
    missingCount = report.missing.length;

    if (missingCount === 0) {
      await repo.transitionRun(runId, claimToken, "RUNNING", { status: "NO_MISSING", eligibleCount, missingCount, finished: true });
      console.log(`${LOG} Run ${periodKey} (${options.trigger}): ${eligibleCount} eligible project(s) checked, 0 missing Other Project Expenses — no email sent.`);
      return { outcome: "no_missing", runId, periodKey, eligibleCount, missingCount };
    }

    const recipients = await resolveSendRecipients();
    const recipientCount = 1 + recipients.cc.length;

    if (!isMissingExpenseEmailEnabled()) {
      await repo.transitionRun(runId, claimToken, "RUNNING", { status: "DISABLED", eligibleCount, missingCount, recipientCount, finished: true });
      console.log(`${LOG} Run ${periodKey} (${options.trigger}): ${eligibleCount} checked, ${missingCount} missing — email delivery is disabled (MISSING_EXPENSE_EMAIL_ENABLED is not "true"); nothing sent.`);
      return { outcome: "disabled", runId, periodKey, eligibleCount, missingCount };
    }

    if (!(await repo.transitionRun(runId, claimToken, "RUNNING", { status: "SENDING", eligibleCount, missingCount, recipientCount }))) {
      console.warn(`${LOG} Run ${periodKey} lost its claim before sending — not sending.`);
      return { outcome: "skipped", reason: "in_progress", periodKey, runId };
    }

    const email = renderReportEmail(report, now);
    let result: SendEmailResult;
    try {
      result = await (senderOverride ?? sendEmail)({ to: recipients.to, cc: recipients.cc, subject: email.subject, html: email.html, text: email.text });
    } catch (err) {
      result = { success: false, error: err instanceof Error ? err.message : String(err) };
    }

    if (result.success) {
      // The owner (claimToken) records the real outcome even if a peer meanwhile marked the send DELIVERY_UNKNOWN.
      await repo.transitionRun(runId, claimToken, ["SENDING", "DELIVERY_UNKNOWN"], { status: "SENT", error: null, finished: true });
      console.log(`${LOG} Run ${periodKey} (${options.trigger}): sent 1 email (To + ${recipients.cc.length} CC) listing ${missingCount} of ${eligibleCount} eligible project(s).`);
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

/** Settings view: recipients, switches, schedule and recent runs. */
export async function getSettingsView(now = new Date()) {
  const [recipients, runs] = await Promise.all([getRecipients(), repo.findRecentRuns(MISSING_EXPENSE_JOB_NAME)]);
  return {
    recipients,
    emailEnabled: isMissingExpenseEmailEnabled(),
    manualTriggerEnabled: isManualTriggerEnabled(),
    schedule: { cron: env.MISSING_EXPENSE_CRON, timezone: env.APP_TIMEZONE },
    recentRuns: runs.map((r) => ({
      periodKey: r.periodKey,
      trigger: r.trigger,
      status: displayRunStatus(r.status, r.updatedAt, now),
      attempts: r.attempts,
      eligibleCount: r.eligibleCount,
      missingCount: r.missingCount,
      recipientCount: r.recipientCount,
      error: r.error,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
    })),
  };
}
