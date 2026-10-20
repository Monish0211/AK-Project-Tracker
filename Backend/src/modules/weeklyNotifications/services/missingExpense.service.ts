import { booleanFromEnv, env } from "../../../shared/utils/env.js";
import { buildMissingOtherExpensesEmail } from "../../../shared/email/templates/missingOtherExpenses.template.js";
import * as repo from "../repository/missingExpense.repository.js";
import {
  buildMissingExpenseReport,
  DEFAULT_CC_EMAILS,
  DEFAULT_TO_EMAIL,
  formatReportTimestamp,
  MISSING_EXPENSE_JOB_NAME,
  MISSING_EXPENSE_SETTING_KEY,
  MISSING_EXPENSE_SUBJECT,
  UNRESOLVED_DEFAULT_CC,
  type CandidateProject,
  type MissingExpenseReport,
} from "../missingExpense.rules.js";
import * as recipientsSvc from "./weeklyRecipients.service.js";
import { lastRunView, runHistoryView, runWeeklyJob, type JobOutcome, type RunOptions, type WeeklySender, type WeeklyJobSpec } from "./weeklyJob.runner.js";
import { pageOf, type PageRequest } from "../weeklyPaging.js";

export type { CcRecipientView, RecipientsView, UpdateRecipientsInput } from "./weeklyRecipients.service.js";
export type { JobOutcome, RunOptions } from "./weeklyJob.runner.js";

/**
 * Weekly "Projects Missing Other Project Expenses" email (Oct 2026).
 *
 * One consolidated email per weekly run to the configured To + CC recipients,
 * only when at least one eligible project has zero Other Project Expenses
 * records. Delivery is gated by MISSING_EXPENSE_EMAIL_ENABLED (default false).
 * The run lifecycle (lock, retry, delivery-unknown) lives in weeklyJob.runner.ts
 * and recipients in weeklyRecipients.service.ts, shared with the other weekly
 * emails.
 */

const LOG = "[MissingExpenseNotification]";

// ── Test seams (same pattern as the PMO Coordinator allocation email) ───────

export type MissingExpenseSender = WeeklySender;
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

export const missingExpenseDefaults = (): recipientsSvc.RecipientDefaults => ({
  toEmail: DEFAULT_TO_EMAIL,
  ccEmails: DEFAULT_CC_EMAILS,
  unresolved: UNRESOLVED_DEFAULT_CC,
});

export function getRecipients() {
  return recipientsSvc.getRecipients(MISSING_EXPENSE_SETTING_KEY, missingExpenseDefaults);
}

export function updateRecipients(input: recipientsSvc.UpdateRecipientsInput, updatedByUserId: string) {
  return recipientsSvc.updateRecipients(MISSING_EXPENSE_SETTING_KEY, input, updatedByUserId, LOG, missingExpenseDefaults);
}

export const listUserOptions = recipientsSvc.listUserOptions;

function resolveSendRecipients() {
  return recipientsSvc.resolveSendRecipients(MISSING_EXPENSE_SETTING_KEY, missingExpenseDefaults, LOG);
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

/**
 * Edit Project opened on one of its sections. The frontend reads `tab` (and,
 * for Invoices, `invoiceLineId` to highlight the line) from the URL, so the
 * link works from an email and survives a refresh. Built from the configured
 * FRONTEND_URL — never from a request header. Access is still checked by the
 * app (Projects module, project access; invoice data needs Invoices).
 */
export function projectEditUrl(projectId: string, tab: "expenses" | "invoices", extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({ tab, ...extra });
  return `${env.FRONTEND_URL.replace(/\/+$/, "")}/projects/edit/${encodeURIComponent(projectId)}?${q.toString()}`;
}

/** The Other Project Expenses email's link: Edit Project → Other Project Expenses. */
export function projectUrl(projectId: string): string {
  return projectEditUrl(projectId, "expenses");
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

/**
 * Paged, read-only preview for Settings → Weekly Emails → Preview Report.
 * The report is built over ALL projects (same rules as the email, so the
 * counts are exact); only one page of its rows is returned. Never sends,
 * never records a run.
 */
export async function previewPage(request: PageRequest, now = new Date()) {
  const [report, recipients] = await Promise.all([buildReport(), resolveSendRecipients()]);
  const page = pageOf(report.missing, request);
  return {
    generatedAt: now.toISOString(),
    generatedAtLabel: formatReportTimestamp(now, env.APP_TIMEZONE),
    timezone: env.APP_TIMEZONE,
    eligibleCount: report.eligibleCount,
    matchCount: report.missing.length,
    ...page,
    items: page.items.map((p) => ({
      id: p.id,
      prNo: p.prNo,
      client: p.client,
      projectTitle: p.projectTitle,
      projectManager: p.projectManager,
      projectStatus: p.projectStatus,
      projectUrl: projectUrl(p.id),
    })),
    recipients,
    emailEnabled: isMissingExpenseEmailEnabled(),
    wouldSend: report.missing.length > 0 && isMissingExpenseEmailEnabled(),
  };
}

// ── The job ─────────────────────────────────────────────────────────────────

const spec: WeeklyJobSpec<MissingExpenseReport> = {
  jobName: MISSING_EXPENSE_JOB_NAME,
  logPrefix: LOG,
  emailFlagName: "MISSING_EXPENSE_EMAIL_ENABLED",
  buildReport,
  counts: (r) => ({ eligibleCount: r.eligibleCount, matchCount: r.missing.length }),
  resolveRecipients: resolveSendRecipients,
  isEmailEnabled: isMissingExpenseEmailEnabled,
  render: renderReportEmail,
  sender: () => senderOverride,
  noun: "project(s) missing Other Project Expenses",
};

/** Runs the check once. Never throws (see weeklyJob.runner.ts). */
export function runMissingExpenseJob(options: RunOptions): Promise<JobOutcome> {
  return runWeeklyJob(spec, options);
}

/** Settings view: recipients, switches, schedule and the latest run only (full history: getRunHistory). */
export async function getSettingsView(now = new Date()) {
  const [recipients, runs] = await Promise.all([getRecipients(), lastRunView(MISSING_EXPENSE_JOB_NAME, now, isManualTriggerEnabled())]);
  return {
    recipients,
    emailEnabled: isMissingExpenseEmailEnabled(),
    manualTriggerEnabled: isManualTriggerEnabled(),
    schedule: { cron: env.MISSING_EXPENSE_CRON, timezone: env.APP_TIMEZONE },
    ...runs,
  };
}

/** Run history page (Settings → Weekly Emails → View All Runs). Read-only. */
export function getRunHistory(query: PageRequest & { status?: string | undefined; trigger?: string | undefined }, now = new Date()) {
  return runHistoryView(MISSING_EXPENSE_JOB_NAME, query, now, isManualTriggerEnabled());
}
