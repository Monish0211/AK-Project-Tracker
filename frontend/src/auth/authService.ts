import { apiClient, setAccessToken, setUnauthorizedHandler } from "../services/apiClient";
import { AUTH_CONFIG } from "./authConfig";

/**
 * Session shape kept close to the OLD mock UserSession (name, employeeId,
 * isAuthenticated) so existing consumers — Navbar's "Employee ID: {user?.employeeId}"
 * display in particular — keep working unmodified, now fed by real backend fields.
 * modules/regions/approvalPermissions are the permission arrays every
 * hasModuleAccess()/hasRegionAccess()/hasApprovalPermission() check reads
 * from (see permissions.ts) — this is the single source of truth for what
 * the logged-in user is allowed to see and do.
 */
export interface UserSession {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  role: string;
  forcePasswordChange: boolean;
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
  role: { id: string; name: string };
  forcePasswordChange: boolean;
}

interface LoginResponseDto {
  token: string;
  refreshToken: string;
  user: SafeUserDto;
}

type MeResponseDto = SafeUserDto & {
  modules: string[];
  regions: string[];
  approvals: string[];
};

function toUserSession(profile: MeResponseDto): UserSession {
  return {
    id: profile.id,
    employeeId: profile.employeeCode ?? "",
    name: profile.fullName,
    email: profile.email,
    role: profile.role.name,
    forcePasswordChange: profile.forcePasswordChange,
    modules: profile.modules,
    regions: profile.regions,
    approvalPermissions: profile.approvals,
    isAuthenticated: true,
  };
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
  if (window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
});

export const authService = {
  async login(email: string, password: string): Promise<UserSession> {
    const result = await apiClient.post<LoginResponseDto>("/auth/login", { email, password });
    // Only the access token is kept client-side — the refresh token the
    // backend also returns is intentionally discarded until refresh-token
    // support is wired into the frontend.
    persistToken(result.token);
    // The login response's `user` doesn't include modules/regions/approvals
    // — fetch the full profile immediately so permissions are in the Auth
    // Context right away, not only after the next page reload.
    const profile = await apiClient.get<MeResponseDto>("/auth/me");
    return toUserSession(profile);
  },

  async fetchCurrentUser(): Promise<UserSession> {
    const profile = await apiClient.get<MeResponseDto>("/auth/me");
    return toUserSession(profile);
  },

  async logout(): Promise<void> {
    try {
      await apiClient.post("/auth/logout");
    } finally {
      // Logout is a client-side guarantee: forget the token even if the
      // network call itself fails.
      persistToken(null);
    }
  },

  hasStoredToken(): boolean {
    return localStorage.getItem(AUTH_CONFIG.tokenStorageKey) !== null;
  },
};
