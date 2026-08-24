import { apiClient, setAccessToken, setUnauthorizedHandler } from "../services/apiClient";
import { AUTH_CONFIG } from "./authConfig";
// Deliberate exception to this function's own "just duplicate key names,
// no cross-module imports" convention below: the actual timesheet mirror
// now lives in IndexedDB (see timesheetService.ts), which — unlike a plain
// localStorage key — can't be wiped by just naming it; clearing it
// requires calling back into the module that owns that storage.
import { clearTimesheetCache } from "../services/timesheetService";

/**
 * Session shape kept close to the OLD mock UserSession (name, employeeId,
 * isAuthenticated) so existing consumers — Navbar's "Employee ID: {user?.employeeId}"
 * display in particular — keep working unmodified, now fed by real backend fields.
 * modules/regions/approvalPermissions are the permission arrays every
 * hasModuleAccess()/hasRegionAccess()/hasApprovalPermission() check reads
 * from (see permissions.ts). phoneNumber/department/designation/employeeType/
 * reportingManagerName/isActive/lastLogin/passwordResetAt exist purely for
 * display (Navbar, My Profile) — nothing reads them to make an access
 * decision. This is the single source of truth for both.
 */
export interface UserSession {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  phoneNumber: string | null;
  department: string | null;
  designation: string | null;
  employeeType: string | null;
  reportingManagerName: string | null;
  role: string;
  isActive: boolean;
  forcePasswordChange: boolean;
  lastLogin: string | null;
  passwordResetAt: string | null;
  modules: string[];
  regions: string[];
  approvalPermissions: string[];
  isAuthenticated: true;
}

interface SafeUserDto {
  id: string;
  employeeCode: string | null;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  department: string | null;
  designation: string | null;
  employeeType: string | null;
  role: { id: string; name: string };
  isActive: boolean;
  forcePasswordChange: boolean;
  lastLogin: string | null;
  passwordResetAt: string | null;
}

interface LoginSuccessDto {
  requiresPasswordChange: false;
  token: string;
  refreshToken: string;
  user: SafeUserDto;
}

/** Returned instead of LoginSuccessDto when the account must change its password before a session can be issued. */
interface LoginRequiresPasswordChangeDto {
  requiresPasswordChange: true;
  email: string;
}

type LoginResponseDto = LoginSuccessDto | LoginRequiresPasswordChangeDto;

export type LoginOutcome =
  | { requiresPasswordChange: true; email: string }
  | { requiresPasswordChange: false; session: UserSession };

type MeResponseDto = SafeUserDto & {
  modules: string[];
  regions: string[];
  approvals: string[];
  reportingManager: { id: string; fullName: string } | null;
};

function toUserSession(profile: MeResponseDto): UserSession {
  return {
    id: profile.id,
    employeeId: profile.employeeCode ?? "",
    name: profile.fullName,
    email: profile.email,
    phoneNumber: profile.phoneNumber,
    department: profile.department,
    designation: profile.designation,
    employeeType: profile.employeeType,
    reportingManagerName: profile.reportingManager?.fullName ?? null,
    role: profile.role.name,
    isActive: profile.isActive,
    forcePasswordChange: profile.forcePasswordChange,
    lastLogin: profile.lastLogin,
    passwordResetAt: profile.passwordResetAt,
    modules: profile.modules,
    regions: profile.regions,
    approvalPermissions: profile.approvals,
    isAuthenticated: true,
  };
}

/**
 * Business-data caches to wipe on logout so a second person logging in on
 * the same shared machine/browser profile never sees the previous user's
 * cached projects/employees/timesheets/notifications/reminders. Deliberately
 * excludes genuinely user-independent preferences (`theme`), the PMO
 * Assistant's own on-screen position (`pmo-assistant-position` — owned by
 * PmoAssistantOrb.tsx, out of scope here), the one-time employees migration
 * marker (`employees_migration_completed_v1` — app state, not per-user
 * data), and the push-subscription device pairing id (`pmo_push_
 * subscription_id` — tied to this browser/device, not this session). Key
 * names are duplicated here deliberately (matching how each owning module
 * already declares its own STORAGE_KEY constant independently) rather than
 * importing every one of those modules into the auth layer just for this.
 */
function clearCachedBusinessDataOnLogout(): void {
  const localStorageKeysToClear = [
    "projects", // projectService.ts — includes nested Quantity/Milestones/Invoices/Expenses mirrors
    "employees_v6", // employeeService.ts
    "timesheets_imports", // timesheetService.ts
    "pmo_notifications", // notifications/notificationRepository.ts (also read by the legacy services/NotificationService.ts)
    "pmo_reminders", // services/reminders/ClientReminderRepository.ts
  ];
  for (const key of localStorageKeysToClear) {
    localStorage.removeItem(key);
  }

  // "timesheets_imports" above only ever clears a small legacy-bridge
  // value now — the real timesheet mirror lives in IndexedDB and needs
  // its own clear so a previous user's cached data can never leak to the
  // next person logging in on this machine (see timesheetService.ts).
  clearTimesheetCache();

  const sessionStorageKeysToClear = [
    "pmo-greeting-shown-session",
    "view-project-tab", // utils/breadcrumbHelpers.ts, pages/Projects/ViewProject.tsx
    "view-project-notes", // utils/breadcrumbHelpers.ts, pages/Projects/ViewProject.tsx
  ];
  for (const key of sessionStorageKeysToClear) {
    sessionStorage.removeItem(key);
  }
}

function persistToken(token: string | null): void {
  setAccessToken(token);
  if (token) {
    localStorage.setItem(AUTH_CONFIG.tokenStorageKey, token);
  } else {
    localStorage.removeItem(AUTH_CONFIG.tokenStorageKey);
  }
}

// Restore the token into the API client as soon as this module loads, so a
// page refresh doesn't force a fresh login before the first authenticated
// request goes out.
persistToken(localStorage.getItem(AUTH_CONFIG.tokenStorageKey));

setUnauthorizedHandler(() => {
  persistToken(null);
  // A session-expiry-triggered logout is still a logout — the same
  // shared-machine exposure applies whether the user clicked "Logout" or
  // their token simply expired mid-session.
  clearCachedBusinessDataOnLogout();
  if (window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
});

export const authService = {
  async login(email: string, password: string): Promise<LoginOutcome> {
    const result = await apiClient.post<LoginResponseDto>("/auth/login", { email, password });

    if (result.requiresPasswordChange) {
      return { requiresPasswordChange: true, email: result.email };
    }

    // Only the access token is kept client-side — the refresh token the
    // backend also returns is intentionally discarded until refresh-token
    // support is wired into the frontend.
    persistToken(result.token);
    // The login response's `user` doesn't include modules/regions/approvals
    // — fetch the full profile immediately so permissions are in the Auth
    // Context right away, not only after the next page reload.
    const profile = await apiClient.get<MeResponseDto>("/auth/me");
    return { requiresPasswordChange: false, session: toUserSession(profile) };
  },

  async fetchCurrentUser(): Promise<UserSession> {
    const profile = await apiClient.get<MeResponseDto>("/auth/me");
    return toUserSession(profile);
  },

  async changePassword(currentPassword: string, newPassword: string, confirmPassword: string): Promise<void> {
    await apiClient.post("/auth/change-password", { currentPassword, newPassword, confirmPassword });
  },

  /**
   * The forced-first-login counterpart to changePassword() — used when no
   * session/JWT exists yet because login() withheld one. Persists the
   * token the same way login() does; the caller still needs to call
   * refreshUser() afterward to populate AuthContext.
   */
  async changeFirstPassword(
    email: string,
    currentPassword: string,
    newPassword: string,
    confirmPassword: string
  ): Promise<void> {
    const result = await apiClient.post<LoginSuccessDto>("/auth/change-first-password", {
      email,
      currentPassword,
      newPassword,
      confirmPassword,
    });
    persistToken(result.token);
  },

  async forgotPassword(email: string): Promise<void> {
    await apiClient.post("/auth/forgot-password", { email });
  },

  async validateResetToken(token: string): Promise<boolean> {
    const result = await apiClient.get<{ valid: boolean }>(
      `/auth/validate-reset-token?token=${encodeURIComponent(token)}`
    );
    return result.valid;
  },

  async resetPassword(token: string, newPassword: string, confirmPassword: string): Promise<void> {
    await apiClient.post("/auth/reset-password", { token, newPassword, confirmPassword });
  },

  async logout(): Promise<void> {
    try {
      await apiClient.post("/auth/logout");
    } finally {
      // Logout is a client-side guarantee: forget the token even if the
      // network call itself fails.
      persistToken(null);
      clearCachedBusinessDataOnLogout();
    }
  },

  hasStoredToken(): boolean {
    return localStorage.getItem(AUTH_CONFIG.tokenStorageKey) !== null;
  },
};
