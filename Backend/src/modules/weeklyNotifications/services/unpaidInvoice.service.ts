import { booleanFromEnv, env } from "../../../shared/utils/env.js";
import { buildUnpaidInvoicesEmail } from "../../../shared/email/templates/unpaidInvoices.template.js";
import * as invoiceRepo from "../repository/unpaidInvoice.repository.js";
import { DEFAULT_TO_EMAIL, formatReportTimestamp } from "../missingExpense.rules.js";
import {
  buildUnpaidInvoiceReport,
  OVERDUE_DAYS,
  totalKnownOutstanding,
  UNPAID_INVOICE_JOB_NAME,
  UNPAID_INVOICE_SETTING_KEY,
  UNPAID_INVOICE_SUBJECT,
  type InvoiceLineCandidate,
  type UnpaidInvoiceReport,
} from "../unpaidInvoice.rules.js";
import * as recipientsSvc from "./weeklyRecipients.service.js";
import { getRecipients as getMissingExpenseRecipients, projectEditUrl } from "./missingExpense.service.js";
import { lastRunView, runHistoryView, runWeeklyJob, type JobOutcome, type RunOptions, type WeeklySender, type WeeklyJobSpec } from "./weeklyJob.runner.js";
import { pageOf, type PageRequest } from "../weeklyPaging.js";

/**
 * Weekly "Invoices Unpaid for 30+ Days" email (Oct 2026). Same lifecycle,
 * lock and recipient handling as the Other Project Expenses email (see
 * weeklyJob.runner.ts / weeklyRecipients.service.ts), with its own settings
 * row, run log (jobName) and switches. Delivery is off unless
 * UNPAID_INVOICE_EMAIL_ENABLED=true.
 */

const LOG = "[UnpaidInvoiceNotification]";

let senderOverride: WeeklySender | null = null;
let emailFlagOverride: boolean | null = null;
let manualFlagOverride: boolean | null = null;
type LineSource = () => Promise<InvoiceLineCandidate[]>;
let lineSourceOverride: LineSource | null = null;

/** Tests only: replace the real sender so nothing is ever delivered. Pass null to restore. */
export function setUnpaidInvoiceSenderForTests(sender: WeeklySender | null): void {
  senderOverride = sender;
}
/** Tests only: evaluate UNPAID_INVOICE_EMAIL_ENABLED as if set to `raw` (null = real env). */
export function setUnpaidInvoiceEmailFlagForTests(raw: string | undefined | null): void {
  emailFlagOverride = raw === null ? null : booleanFromEnv.parse(raw);
}
/** Tests only: evaluate UNPAID_INVOICE_MANUAL_TRIGGER_ENABLED as if set to `raw` (null = real env). */
export function setUnpaidInvoiceManualFlagForTests(raw: string | undefined | null): void {
  manualFlagOverride = raw === null ? null : booleanFromEnv.parse(raw);
}
/** Tests only: replace the invoice-line source (the lock/run logic still uses the real database). */
export function setUnpaidInvoiceLinesForTests(source: LineSource | null): void {
  lineSourceOverride = source;
}

export function isUnpaidInvoiceEmailEnabled(): boolean {
  return emailFlagOverride ?? env.UNPAID_INVOICE_EMAIL_ENABLED;
}
export function isUnpaidInvoiceManualTriggerEnabled(): boolean {
  return manualFlagOverride ?? env.UNPAID_INVOICE_MANUAL_TRIGGER_ENABLED;
}

// ── Recipients ──────────────────────────────────────────────────────────────

/**
 * Defaults until an administrator saves this notification's recipients:
 * To info@ifluids.com; CC = the Accounts-team CC list currently configured
 * for the Other Project Expenses email (real, administrator-entered
 * addresses — nothing guessed).
 */
export function defaultsFromAccounts(accounts: { cc: { email: string }[] }): recipientsSvc.RecipientDefaults {
  return { toEmail: DEFAULT_TO_EMAIL, ccEmails: accounts.cc.map((c) => c.email), unresolved: [] };
}

type AccountsSource = () => Promise<{ cc: { email: string }[] }>;
let accountsSourceOverride: AccountsSource | null = null;
/** Tests only: replace where the default Accounts CC list is read from (null = the expense email's settings). */
export function setUnpaidInvoiceAccountsSourceForTests(source: AccountsSource | null): void {
  accountsSourceOverride = source;
}

export async function unpaidInvoiceDefaults(): Promise<recipientsSvc.RecipientDefaults> {
  return defaultsFromAccounts(await (accountsSourceOverride ?? getMissingExpenseRecipients)());
}

export function getRecipients() {
  return recipientsSvc.getRecipients(UNPAID_INVOICE_SETTING_KEY, unpaidInvoiceDefaults);
}
export function updateRecipients(input: recipientsSvc.UpdateRecipientsInput, updatedByUserId: string) {
  return recipientsSvc.updateRecipients(UNPAID_INVOICE_SETTING_KEY, input, updatedByUserId, LOG, unpaidInvoiceDefaults);
}
export const listUserOptions = recipientsSvc.listUserOptions;
function resolveSendRecipients() {
  return recipientsSvc.resolveSendRecipients(UNPAID_INVOICE_SETTING_KEY, unpaidInvoiceDefaults, LOG);
}

// ── Report ──────────────────────────────────────────────────────────────────

/** Edit Project → Invoices, with the invoice's (earliest) line highlighted. */
export function invoiceUrl(row: { projectId: string; invoiceLineId: string }): string {
  return projectEditUrl(row.projectId, "invoices", { invoiceLineId: row.invoiceLineId });
}

export async function buildReport(now = new Date()): Promise<UnpaidInvoiceReport> {
  return buildUnpaidInvoiceReport(await (lineSourceOverride ?? invoiceRepo.findUnpaidInvoiceLines)(), now, env.APP_TIMEZONE);
}

export function renderReportEmail(report: UnpaidInvoiceReport, now: Date) {
  return buildUnpaidInvoicesEmail({
    subject: UNPAID_INVOICE_SUBJECT,
    generatedAt: formatReportTimestamp(now, env.APP_TIMEZONE),
    eligibleCount: report.eligibleCount,
    overdueDays: OVERDUE_DAYS,
    knownOutstandingINR: totalKnownOutstanding(report.overdue),
    partiallyPaidCount: report.overdue.filter((r) => r.status === "Partially Paid").length,
    rows: report.overdue.map((r) => ({ ...r, projectUrl: invoiceUrl(r) })),
  });
}

/** Read-only preview for Settings. Never sends, never records a run. */
export async function previewReport(now = new Date()) {
  const report = await buildReport(now);
  const email = renderReportEmail(report, now);
  const recipients = await resolveSendRecipients();
  return {
    eligibleCount: report.eligibleCount,
    missingCount: report.overdue.length,
    knownOutstandingINR: totalKnownOutstanding(report.overdue),
    invoices: report.overdue.map((r) => ({ ...r, projectUrl: invoiceUrl(r) })),
    subject: email.subject,
    html: email.html,
    text: email.text,
    recipients,
    wouldSend: report.overdue.length > 0 && isUnpaidInvoiceEmailEnabled(),
  };
}

/**
 * Paged, read-only preview (Settings → Weekly Emails → Preview Report). The
 * report is built over ALL unpaid invoices with the email's own rules, so the
 * counts and outstanding total cover the complete result; only one page of
 * rows is returned. Never sends, never records a run.
 */
export async function previewPage(request: PageRequest, now = new Date()) {
  const [report, recipients] = await Promise.all([buildReport(now), resolveSendRecipients()]);
  const page = pageOf(report.overdue, request);
  return {
    generatedAt: now.toISOString(),
    generatedAtLabel: formatReportTimestamp(now, env.APP_TIMEZONE),
    timezone: env.APP_TIMEZONE,
    eligibleCount: report.eligibleCount,
    matchCount: report.overdue.length,
    summary: {
      overdueDays: OVERDUE_DAYS,
      knownOutstandingINR: totalKnownOutstanding(report.overdue),
      partiallyPaidCount: report.overdue.filter((r) => r.status === "Partially Paid").length,
    },
    ...page,
    items: page.items.map((r) => ({ ...r, projectUrl: invoiceUrl(r) })),
    recipients,
    emailEnabled: isUnpaidInvoiceEmailEnabled(),
    wouldSend: report.overdue.length > 0 && isUnpaidInvoiceEmailEnabled(),
  };
}

// ── The job ─────────────────────────────────────────────────────────────────

const spec: WeeklyJobSpec<UnpaidInvoiceReport> = {
  jobName: UNPAID_INVOICE_JOB_NAME,
  logPrefix: LOG,
  emailFlagName: "UNPAID_INVOICE_EMAIL_ENABLED",
  buildReport: (now) => buildReport(now),
  counts: (r) => ({ eligibleCount: r.eligibleCount, matchCount: r.overdue.length }),
  resolveRecipients: resolveSendRecipients,
  isEmailEnabled: isUnpaidInvoiceEmailEnabled,
  render: renderReportEmail,
  sender: () => senderOverride,
  noun: `invoice(s) unpaid for ${OVERDUE_DAYS}+ days`,
};

/** Runs the check once. Never throws (see weeklyJob.runner.ts). */
export function runUnpaidInvoiceJob(options: RunOptions): Promise<JobOutcome> {
  return runWeeklyJob(spec, options);
}

/** Settings view: recipients, switches, schedule and the latest run only (full history: getRunHistory). */
export async function getSettingsView(now = new Date()) {
  const [recipients, runs] = await Promise.all([getRecipients(), lastRunView(UNPAID_INVOICE_JOB_NAME, now, isUnpaidInvoiceManualTriggerEnabled())]);
  return {
    recipients,
    emailEnabled: isUnpaidInvoiceEmailEnabled(),
    manualTriggerEnabled: isUnpaidInvoiceManualTriggerEnabled(),
    schedule: { cron: env.UNPAID_INVOICE_CRON, timezone: env.APP_TIMEZONE },
    ...runs,
  };
}

/** Run history page (Settings → Weekly Emails → View All Runs). Read-only. */
export function getRunHistory(query: PageRequest & { status?: string | undefined; trigger?: string | undefined }, now = new Date()) {
  return runHistoryView(UNPAID_INVOICE_JOB_NAME, query, now, isUnpaidInvoiceManualTriggerEnabled());
}
