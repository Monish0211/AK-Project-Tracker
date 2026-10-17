import { apiClient } from "./apiClient";

/**
 * Settings → Weekly Emails (Oct 2026) — the weekly "Projects Missing Other
 * Project Expenses" report. Every call needs the Settings module and the
 * Administrator or PMO Manager role (enforced by the backend).
 */

const BASE = "/notification-settings/missing-expenses";

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
}

export interface WeeklyEmailSettings {
  recipients: WeeklyEmailRecipients;
  emailEnabled: boolean;
  manualTriggerEnabled: boolean;
  schedule: { cron: string; timezone: string };
  recentRuns: WeeklyEmailRun[];
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
  NO_MISSING: "No missing projects — not sent",
  DISABLED: "Checked — email delivery disabled",
  DELIVERY_UNKNOWN: "Interrupted — delivery unknown",
  INTERRUPTED: "Interrupted before sending — can be retried",
};

export const SKIP_REASON_LABELS: Record<string, string> = {
  already_completed: "this run already finished (a manual run is limited to one per 10 minutes; a sent week is never sent again)",
  in_progress: "another run is in progress",
  delivery_unknown: "a previous send was interrupted and its delivery is unknown, so it is not re-sent automatically",
};
