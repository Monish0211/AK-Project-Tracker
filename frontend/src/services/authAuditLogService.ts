import { apiClient } from "./apiClient";

/**
 * REST client for the real, backend-persisted AuthAuditLog table
 * (GET /auth/audit-logs — Administrator-only). Deliberately separate from
 * auditLogService.ts, which is a client-local demo/mock "Enterprise Audit
 * Trail" feature with its own fabricated data shape (module/action/status) —
 * this file only ever reflects genuine authentication events recorded by
 * the backend (login/logout/password change/reset), nothing invented.
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

/** Human-readable labels for the fixed event strings auth.service.ts writes — see Backend/src/modules/auth/services/auth.service.ts's logAuthEvent() call sites. Falls back to the raw event string for anything not yet in this list, so a new event type never renders as blank. */
const EVENT_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: "Login succeeded",
  LOGIN_FAILED_UNKNOWN_EMAIL: "Login failed (unknown email)",
  LOGIN_FAILED_BAD_PASSWORD: "Login failed (wrong password)",
  LOGIN_BLOCKED_ACCOUNT_LOCKED: "Login blocked (account locked)",
  LOGIN_BLOCKED_INACTIVE: "Login blocked (account inactive)",
  LOGIN_REQUIRES_PASSWORD_CHANGE: "Login requires password change",
  ACCOUNT_LOCKED_TOO_MANY_ATTEMPTS: "Account locked (too many failed attempts)",
  LOGOUT: "Logged out",
  TOKEN_REFRESHED: "Session token refreshed",
  FIRST_PASSWORD_CHANGE_FAILED_BAD_CURRENT: "First-login password change failed",
  FIRST_PASSWORD_CHANGE_COMPLETED: "First-login password change completed",
  CHANGE_PASSWORD_FAILED_BAD_CURRENT: "Password change failed (wrong current password)",
  PASSWORD_CHANGED: "Password changed",
  PASSWORD_RESET_REQUESTED: "Password reset requested",
  PASSWORD_RESET_REQUESTED_UNKNOWN_EMAIL: "Password reset requested (unknown email)",
  PASSWORD_RESET_COMPLETED: "Password reset completed",
};

export function describeAuditEvent(event: string): string {
  return EVENT_LABELS[event] ?? event;
}

export function isFailureEvent(event: string): boolean {
  return /FAILED|BLOCKED|LOCKED/i.test(event);
}

export async function fetchAuthAuditLogs(page: number, pageSize: number): Promise<AuthAuditLogPage> {
  return apiClient.get<AuthAuditLogPage>(`/auth/audit-logs?page=${page}&pageSize=${pageSize}`);
}
