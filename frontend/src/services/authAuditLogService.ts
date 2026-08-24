import { apiClient } from "./apiClient";

/**
 * REST client for the real, backend-persisted AuthAuditLog table
 * (GET /auth/audit-logs — Administrator-only). This is the ONLY audit data
 * source for the Security & Audit Logs Settings tab — the old
 * auditLogService.ts (a client-local fabricated dataset with invented
 * fields like module/employeeId/session) has been removed; nothing in this
 * file or its consumers displays anything the backend didn't actually
 * record.
 */
export interface AuthAuditLogEntry {
  id: string;
  occurredAt: string;
  event: string;
  email: string;
  userId: string | null;
  userFullName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AuthAuditLogPage {
  items: AuthAuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export type AuditEventCategory = "success" | "failure";

export interface AuthAuditLogFilters {
  email?: string;
  event?: string;
  eventCategory?: AuditEventCategory;
  ipAddress?: string;
  from?: Date;
  to?: Date;
}

/** Human-readable labels for the fixed event strings auth.service.ts writes — see Backend/src/modules/auth/services/auth.service.ts's logAuthEvent() call sites. Falls back to the raw event string for anything not yet in this list, so a new event type never renders as blank. This is also the source of truth for the frontend's event-type filter dropdown — every value here is a real, currently-emitted event, nothing invented. */
export const EVENT_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: "Login Successful",
  LOGIN_FAILED_UNKNOWN_EMAIL: "Login Failed (Unknown Email)",
  LOGIN_FAILED_BAD_PASSWORD: "Login Failed (Wrong Password)",
  LOGIN_BLOCKED_ACCOUNT_LOCKED: "Login Blocked (Account Locked)",
  LOGIN_BLOCKED_INACTIVE: "Login Blocked (Account Inactive)",
  LOGIN_REQUIRES_PASSWORD_CHANGE: "Login Requires Password Change",
  ACCOUNT_LOCKED_TOO_MANY_ATTEMPTS: "Account Locked (Too Many Attempts)",
  LOGOUT: "Logged Out",
  TOKEN_REFRESHED: "Session Token Refreshed",
  FIRST_PASSWORD_CHANGE_FAILED_BAD_CURRENT: "First-Login Password Change Failed",
  FIRST_PASSWORD_CHANGE_COMPLETED: "First-Login Password Change Completed",
  CHANGE_PASSWORD_FAILED_BAD_CURRENT: "Password Change Failed (Wrong Current Password)",
  PASSWORD_CHANGED: "Password Changed",
  PASSWORD_RESET_REQUESTED: "Password Reset Requested",
  PASSWORD_RESET_REQUESTED_UNKNOWN_EMAIL: "Password Reset Requested (Unknown Email)",
  PASSWORD_RESET_COMPLETED: "Password Reset Completed",
};

/** Fallback formatter for any event value not in EVENT_LABELS (e.g. a future event type) — never breaks, just title-cases the raw string instead of leaving it blank. */
export function describeAuditEvent(event: string): string {
  if (EVENT_LABELS[event]) return EVENT_LABELS[event];
  return event
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

/** Same success/failure classification the backend's `eventCategory` filter uses (see auth.repository.ts's FAILURE_EVENT_PATTERNS) — kept in sync manually since it's a simple, stable, three-keyword rule. */
export function isFailureEvent(event: string): boolean {
  return /FAILED|BLOCKED|LOCKED/i.test(event);
}

function buildQuery(page: number, pageSize: number, filters?: AuthAuditLogFilters): string {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (filters?.email) params.set("email", filters.email);
  if (filters?.event) params.set("event", filters.event);
  if (filters?.eventCategory) params.set("eventCategory", filters.eventCategory);
  if (filters?.ipAddress) params.set("ipAddress", filters.ipAddress);
  if (filters?.from) params.set("from", filters.from.toISOString());
  if (filters?.to) params.set("to", filters.to.toISOString());
  return params.toString();
}

export async function fetchAuthAuditLogs(page: number, pageSize: number, filters?: AuthAuditLogFilters): Promise<AuthAuditLogPage> {
  return apiClient.get<AuthAuditLogPage>(`/auth/audit-logs?${buildQuery(page, pageSize, filters)}`);
}

/** Fetches only the `total` count for a filter combination (pageSize=1, items ignored) — used for the KPI cards so they never require pulling bulk rows into the browser just to count them. */
async function fetchAuditLogCount(filters?: AuthAuditLogFilters): Promise<number> {
  const result = await fetchAuthAuditLogs(1, 1, filters);
  return result.total;
}

export interface AuditKpiCounts {
  totalEvents: number;
  successfulLoginsToday: number;
  failedAttemptsToday: number;
}

/** All three counts are real, backend-derived totals — never client-side estimates over a partial page. */
export async function fetchAuditKpiCounts(): Promise<AuditKpiCounts> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [totalEvents, successfulLoginsToday, failedAttemptsToday] = await Promise.all([
    fetchAuditLogCount(),
    fetchAuditLogCount({ event: "LOGIN_SUCCESS", from: todayStart }),
    fetchAuditLogCount({ eventCategory: "failure", from: todayStart }),
  ]);

  return { totalEvents, successfulLoginsToday, failedAttemptsToday };
}

/**
 * Neutralizes CSV/spreadsheet formula injection (CWE-1236) before a value is
 * ever quoted into an exported cell. Several exported fields — most
 * critically `userAgent`, which is taken verbatim from the HTTP User-Agent
 * header at login time — are 100% unauthenticated-client-controlled, so a
 * value like `=cmd|'/c calc'!A0` could otherwise detonate as a live formula
 * the moment an Administrator opens the export in Excel/Sheets. Any value
 * whose first character is one Excel/Sheets treats as a formula trigger
 * (=, +, -, @) is prefixed with a single quote, which every spreadsheet
 * application renders as plain text rather than evaluating. Ordinary values
 * (including ones that merely contain, but don't start with, these
 * characters) are returned unchanged. `"`-escaping for CSV quoting itself
 * happens separately, after this, in the caller below.
 */
function sanitizeCsvCell(value: string): string {
  if (/^[=+\-@]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

function toCsvCell(value: string): string {
  return `"${sanitizeCsvCell(value).replace(/"/g, "'")}"`;
}

/**
 * Exports exactly the rows currently loaded in the browser (the current
 * page) — never a fabricated or full-database export. A true "export
 * everything" would need a dedicated bulk-export backend endpoint, which is
 * out of scope here; exporting what's genuinely on screen keeps this honest
 * about what it does.
 */
export function exportAuditLogsToCsv(items: AuthAuditLogEntry[]): void {
  const headers = ["Timestamp", "Email", "User ID", "Event", "IP Address", "User Agent"];
  const rows = items.map((item) => [
    toCsvCell(new Date(item.occurredAt).toLocaleString()),
    toCsvCell(item.email),
    toCsvCell(item.userId ?? ""),
    toCsvCell(describeAuditEvent(item.event)),
    toCsvCell(item.ipAddress ?? ""),
    toCsvCell(item.userAgent ?? ""),
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `auth-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
