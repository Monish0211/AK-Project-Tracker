import { AUTH_CONFIG } from "./authConfig";

export interface UserSession {
  employeeId: string;
  name: string;
  isAuthenticated: boolean;
}

export const authService = {
  login(employeeId: string, password: string): UserSession | null {
    const { demoUser } = AUTH_CONFIG;
    if (
      employeeId.trim().toUpperCase() === demoUser.employeeId.toUpperCase() &&
      password === demoUser.password
    ) {
      const session: UserSession = {
        employeeId: demoUser.employeeId,
        name: demoUser.name,
        isAuthenticated: true,
      };
      localStorage.setItem(AUTH_CONFIG.sessionKey, JSON.stringify(session));
      return session;
    }
    return null;
  },

  logout(): void {
    localStorage.removeItem(AUTH_CONFIG.sessionKey);
  },

  getCurrentSession(): UserSession | null {
    const raw = localStorage.getItem(AUTH_CONFIG.sessionKey);
    if (!raw) return null;
    try {
      const session = JSON.parse(raw) as UserSession;
      if (session && session.isAuthenticated) {
        return session;
      }
    } catch (e) {
      console.error("Failed to parse auth session", e);
    }
    return null;
  },
};
