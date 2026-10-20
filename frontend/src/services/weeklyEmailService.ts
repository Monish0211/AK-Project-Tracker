import { apiClient } from "./apiClient";

/**
 * Settings → Weekly Emails (Oct 2026) — the weekly "Projects Missing Other
 * Project Expenses" report and the weekly "Invoices Unpaid for 30+ Days"
 * reminder. Every call needs the Settings module and the Administrator or PMO
 * Manager role (enforced by the backend); the invoice preview also needs the
 * Invoices module.
 */

const BASE = "/notification-settings/missing-expenses";
const UNPAID_INVOICES_BASE = "/notification-settings/unpaid-invoices";

export interface WeeklyEmailCcRecipient {
  email: string;
  portalUserId: string | null;
  userName: string | null;
  userActive: boolean | null;
}

export interface WeeklyEmailRecipients {
  toEmail: string;
  cc: WeeklyEmailCcRecipient[];
  isDefault: boolean;
  unresolvedDefaults: string[];
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface WeeklyEmailRun {
  id: string;
  periodKey: string;
  trigger: string;
  status: string;
  attempts: number;
  eligibleCount: number | null;
  missingCount: number | null;
  recipientCount: number | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  /** Backend-confirmed: this week's scheduled run, nothing was delivered, and manual runs are enabled. */
  retryable: boolean;
}

export interface WeeklyEmailSettings {
  recipients: WeeklyEmailRecipients;
  emailEnabled: boolean;
  manualTriggerEnabled: boolean;
  schedule: { cron: string; timezone: string };
  /** The newest run only — the full history is on the View All Runs page. */
  lastRun: WeeklyEmailRun | null;
  totalRuns: number;
}

export interface WeeklyEmailUserOption {
  id: string;
  fullName: string;
  email: string;
  role: string | null;
}

export interface WeeklyEmailPreview {
  eligibleCount: number;
  missingCount: number;
  projects: { id: string; prNo: string; client: string; projectTitle: string; projectManager: string | null; projectStatus: string; projectUrl: string }[];
  subject: string;
  html: string;
  recipients: { to: string; cc: string[] };
  wouldSend: boolean;
}

export type WeeklyEmailRunResult =
  | { outcome: "sent" | "no_missing" | "disabled" | "failed"; periodKey: string; eligibleCount: number; missingCount: number; error?: string }
  | { outcome: "skipped"; reason: string; periodKey: string };

export interface UnpaidInvoicePreviewRow {
  projectId: string;
  prNo: string;
  client: string;
  projectTitle: string;
  projectManager: string | null;
  invoiceNo: string;
  invoiceDate: string;
  daysSinceRaised: number;
  invoiceAmountINR: number;
  amountPaidINR: number | null;
  outstandingINR: number | null;
  status: "Raised / Submitted" | "Partially Paid";
  originalAmountNote: string | null;
  projectUrl: string;
}

export interface UnpaidInvoicePreview {
  eligibleCount: number;
  missingCount: number;
  knownOutstandingINR: number;
  invoices: UnpaidInvoicePreviewRow[];
  subject: string;
  html: string;
  recipients: { to: string; cc: string[] };
  wouldSend: boolean;
}

// ── Paged preview / run history (Settings → Weekly Emails sub-pages) ────────

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
/** The backend rejects anything larger (400). */
export const MAX_PAGE_SIZE = 100;

export interface PageInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** One page of a report, plus whole-report figures (never just the visible page's). */
export interface WeeklyEmailPreviewPage<Row, Summary = undefined> extends PageInfo {
  generatedAt: string;
  generatedAtLabel: string; // "20 Oct 2026, 10:41 IST (Asia/Kolkata)"
  timezone: string;
  eligibleCount: number;
  matchCount: number;
  summary: Summary;
  items: Row[];
  recipients: { to: string; cc: string[] };
  emailEnabled: boolean;
  wouldSend: boolean;
}

export type MissingExpensePreviewRow = WeeklyEmailPreview["projects"][number];
export interface UnpaidInvoiceSummary {
  overdueDays: number;
  knownOutstandingINR: number;
  partiallyPaidCount: number;
}
export type MissingExpensePreviewPage = WeeklyEmailPreviewPage<MissingExpensePreviewRow>;
export type UnpaidInvoicePreviewPage = WeeklyEmailPreviewPage<UnpaidInvoicePreviewRow, UnpaidInvoiceSummary>;

export interface WeeklyEmailRunPage extends PageInfo {
  items: WeeklyEmailRun[];
}

export interface RunHistoryFilters {
  status?: string;
  trigger?: string;
}

/** "?page=2&pageSize=50&status=FAILED" — empty filters are omitted (the backend rejects empty values). */
export function pageQuery(page: number, pageSize: number, filters: RunHistoryFilters = {}): string {
  const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (filters.status) q.set("status", filters.status);
  if (filters.trigger) q.set("trigger", filters.trigger);
  return `?${q.toString()}`;
}

/** The same calls for any weekly notification, by its API base path. */
export function weeklyEmailApi<P, PP = WeeklyEmailPreviewPage<unknown, unknown>>(base: string) {
  return {
    getSettings: () => apiClient.get<WeeklyEmailSettings>(base),
    saveRecipients: (toEmail: string, cc: { email: string; portalUserId: string | null }[]) => apiClient.put<WeeklyEmailRecipients>(base, { toEmail, cc }),
    getUserOptions: async () => (await apiClient.get<{ items: WeeklyEmailUserOption[] }>(`${base}/user-options`)).items,
    /** Full report incl. the rendered email (kept for compatibility; the UI uses previewPage). */
    preview: () => apiClient.post<P>(`${base}/preview`, {}),
    /** One page of the report — read-only, never sends. */
    previewPage: (page: number, pageSize: number) => apiClient.get<PP>(`${base}/preview${pageQuery(page, pageSize)}`),
    runs: (page: number, pageSize: number, filters: RunHistoryFilters = {}) => apiClient.get<WeeklyEmailRunPage>(`${base}/runs${pageQuery(page, pageSize, filters)}`),
    run: (mode: "manual" | "retry-weekly") => apiClient.post<WeeklyEmailRunResult>(`${base}/run`, { mode }),
  };
}
export type WeeklyEmailApi<P, PP = WeeklyEmailPreviewPage<unknown, unknown>> = ReturnType<typeof weeklyEmailApi<P, PP>>;

export const missingExpenseEmailApi = weeklyEmailApi<WeeklyEmailPreview, MissingExpensePreviewPage>(BASE);
export const unpaidInvoiceEmailApi = weeklyEmailApi<UnpaidInvoicePreview, UnpaidInvoicePreviewPage>(UNPAID_INVOICES_BASE);

/**
 * The CC picker lists the same active PMO Portal users on every card, so cards
 * opened together share ONE in-flight request. Nothing is kept once it
 * settles — the next visit asks the server again (no stale cache).
 */
let userOptionsInFlight: Promise<WeeklyEmailUserOption[]> | null = null;
export function loadSharedUserOptions(): Promise<WeeklyEmailUserOption[]> {
  if (!userOptionsInFlight) {
    userOptionsInFlight = missingExpenseEmailApi.getUserOptions().finally(() => {
      userOptionsInFlight = null;
    });
  }
  return userOptionsInFlight;
}

export const getWeeklyEmailSettings = () => apiClient.get<WeeklyEmailSettings>(BASE);

export const saveWeeklyEmailRecipients = (toEmail: string, cc: { email: string; portalUserId: string | null }[]) =>
  apiClient.put<WeeklyEmailRecipients>(BASE, { toEmail, cc });

export const getWeeklyEmailUserOptions = async () => (await apiClient.get<{ items: WeeklyEmailUserOption[] }>(`${BASE}/user-options`)).items;

export const previewWeeklyEmail = () => apiClient.post<WeeklyEmailPreview>(`${BASE}/preview`, {});

export const runWeeklyEmailNow = (mode: "manual" | "retry-weekly") => apiClient.post<WeeklyEmailRunResult>(`${BASE}/run`, { mode });

/** Same checks as the backend (which remains the authority): valid address, no duplicates, CC ≠ To. */
const EMAIL_RE = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

export function isValidEmailAddress(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

export function recipientError(toEmail: string, ccEmails: string[]): string | null {
  const to = toEmail.trim();
  if (!to) return "The To address is required.";
  if (!isValidEmailAddress(to)) return `"${to}" is not a valid email address.`;
  const seen = new Set([to.toLowerCase()]);
  for (const raw of ccEmails) {
    const email = raw.trim();
    if (!isValidEmailAddress(email)) return `"${email}" is not a valid email address.`;
    if (seen.has(email.toLowerCase())) return `"${email}" is listed more than once.`;
    seen.add(email.toLowerCase());
  }
  return null;
}

export const RUN_STATUS_LABELS: Record<string, string> = {
  RUNNING: "Running",
  SENDING: "Sending",
  SENT: "Sent",
  FAILED: "Failed",
  NO_MISSING: "Checked — no email needed",
  DISABLED: "Delivery disabled",
  DELIVERY_UNKNOWN: "Delivery unknown",
  INTERRUPTED: "Interrupted",
};

/** What happened to the email, per displayed status (the history page's Delivery column). */
export function deliveryOutcome(run: Pick<WeeklyEmailRun, "status" | "recipientCount">): string {
  switch (run.status) {
    case "SENT":
      return run.recipientCount ? `Delivered to ${run.recipientCount} recipient${run.recipientCount === 1 ? "" : "s"}` : "Delivered";
    case "NO_MISSING":
      return "Not needed — nothing to report";
    case "DISABLED":
      return "Not sent — delivery is off on this server";
    case "FAILED":
      return "Not delivered — the send failed";
    case "INTERRUPTED":
      return "Not sent — stopped before sending";
    case "DELIVERY_UNKNOWN":
      return "Unknown — may have been delivered; never re-sent automatically";
    case "SENDING":
      return "Sending…";
    default:
      return "In progress";
  }
}

export function runStatusTone(status: string): "success" | "danger" | "warning" | "neutral" | "info" {
  if (status === "SENT") return "success";
  if (status === "FAILED") return "danger";
  if (status === "DELIVERY_UNKNOWN" || status === "INTERRUPTED") return "warning";
  if (status === "RUNNING" || status === "SENDING") return "info";
  return "neutral"; // NO_MISSING, DISABLED
}

/** Run-history filter options; values are the backend's displayed statuses. */
export const RUN_STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All statuses" },
  ...["SENT", "NO_MISSING", "DISABLED", "FAILED", "INTERRUPTED", "DELIVERY_UNKNOWN", "RUNNING", "SENDING"].map((value) => ({ value, label: RUN_STATUS_LABELS[value] ?? value })),
];
export const RUN_TRIGGER_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All run types" },
  { value: "scheduled", label: "Weekly (scheduled)" },
  { value: "manual", label: "Manual" },
];

export const SKIP_REASON_LABELS: Record<string, string> = {
  already_completed: "this run already finished (a manual run is limited to one per 10 minutes; a sent week is never sent again)",
  in_progress: "another run is in progress",
  delivery_unknown: "a previous send was interrupted and its delivery is unknown, so it is not re-sent automatically",
};
