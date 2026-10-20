import { missingExpenseEmailApi, unpaidInvoiceEmailApi, type WeeklyEmailApi } from "../../../../services/weeklyEmailService";

/**
 * Settings → Weekly Emails (Oct 2026): one entry per weekly notification.
 * The Settings card, the Preview Report page and the View All Runs page all
 * read their wording, API and routes from here, so a notification is never
 * described two different ways.
 */

export type WeeklyEmailSlug = "other-expenses" | "unpaid-invoices";

export interface WeeklyEmailNotification {
  slug: WeeklyEmailSlug;
  /** DOM id prefix (input ids, data-section). */
  id: string;
  title: string;
  subtitle: string;
  flagName: string;
  itemNoun: string; // "project(s)" / "invoice(s)"
  matchPhrase: string; // "eligible project is missing Other Project Expenses"
  eligibleLabel: string; // preview summary: what was checked
  matchLabel: string; // preview summary + run history column: what is listed
  /** Extra module the preview needs (the backend enforces it too). */
  previewModule?: string;
  api: WeeklyEmailApi<unknown, unknown>;
}

export const WEEKLY_EMAILS_SETTINGS_PATH = "/settings?tab=weeklyEmails";
export const weeklyEmailPreviewPath = (slug: WeeklyEmailSlug) => `/settings/weekly-emails/${slug}/preview`;
export const weeklyEmailRunsPath = (slug: WeeklyEmailSlug) => `/settings/weekly-emails/${slug}/runs`;

export const WEEKLY_EMAIL_NOTIFICATIONS: readonly WeeklyEmailNotification[] = [
  {
    slug: "other-expenses",
    id: "weekly-emails",
    title: "Projects Missing Other Project Expenses",
    subtitle: "Weekly email listing projects (except Not Started, On Hold, Completed and Cancelled) with no Other Project Expenses records. Sent only when at least one project is missing.",
    flagName: "MISSING_EXPENSE_EMAIL_ENABLED",
    itemNoun: "project(s)",
    matchPhrase: "eligible project is missing Other Project Expenses",
    eligibleLabel: "Eligible projects checked",
    matchLabel: "Missing Other Project Expenses",
    api: missingExpenseEmailApi,
  },
  {
    slug: "unpaid-invoices",
    id: "weekly-unpaid-invoices",
    title: "Invoices Unpaid for 30+ Days",
    subtitle: "Weekly reminder of Raised / Submitted and Partially Paid invoices dated 30+ calendar days ago (Asia/Kolkata). Sent only when one qualifies.",
    flagName: "UNPAID_INVOICE_EMAIL_ENABLED",
    itemNoun: "invoice(s)",
    matchPhrase: "invoice has been unpaid for 30 days or more",
    eligibleLabel: "Raised / Submitted and Partially Paid invoices checked",
    matchLabel: "Unpaid for 30+ days",
    previewModule: "Invoices",
    api: unpaidInvoiceEmailApi,
  },
];

export function findWeeklyEmailNotification(slug: string | undefined): WeeklyEmailNotification | null {
  return WEEKLY_EMAIL_NOTIFICATIONS.find((n) => n.slug === slug) ?? null;
}

/** Same two roles as the backend's /notification-settings routes (and the Settings tab). */
export function canManageWeeklyEmails(role: string | null | undefined): boolean {
  return role === "Administrator" || role === "PMO Manager";
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Every Monday at 11:00 (Asia/Kolkata)" for simple weekly expressions; the raw expression otherwise. */
export function describeSchedule(cron: string, timezone: string): string {
  const m = cron.trim().match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+([0-6])$/);
  if (!m) return `Cron "${cron}" (${timezone})`;
  return `Every ${DAYS[Number(m[3])]} at ${m[2]!.padStart(2, "0")}:${m[1]!.padStart(2, "0")} (${timezone})`;
}

export function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-09-01" → "01 Sep 2026" (the email's fixed format). */
export function formatInvoiceDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d} ${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

export function runTypeLabel(run: { trigger: string; periodKey: string }): string {
  return run.trigger === "manual" ? "Manual" : `Weekly ${run.periodKey}`;
}
