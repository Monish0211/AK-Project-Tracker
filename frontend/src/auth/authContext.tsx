import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authService } from "./authService";
import type { UserSession } from "./authService";

export interface LoginResult {
  success: boolean;
  error?: string;
  /** True when the account must change its password before a session can be issued — no `user` was set; the caller should redirect to /auth/change-password. */
  requiresPasswordChange?: boolean;
  email?: string;
}

interface AuthContextType {
  user: UserSession | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => void;
  /** Re-fetches GET /auth/me and updates `user` — call after any action that changes the account (e.g. Change Password) so the session reflects it immediately. */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, a stored token is re-validated against the server (GET
  // /auth/me) rather than trusted as-is — a token can go stale (expired,
  // account locked/deactivated) between visits, and the profile it returns
  // is always the source of truth for the session.
  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      if (!authService.hasStoredToken()) {
        if (isMounted) setLoading(false);
        return;
      }

      try {
        const session = await authService.fetchCurrentUser();
        if (isMounted) setUser(session);
      } catch {
        // Invalid/expired token — apiClient's 401 handler already cleared
        // it; nothing further to do here.
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    restoreSession();
    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (email: string, password: string): Promise<LoginResult> => {
    try {
      const outcome = await authService.login(email, password);
      if (outcome.requiresPasswordChange) {
        return { success: true, requiresPasswordChange: true, email: outcome.email };
      }
      setUser(outcome.session);
      return { success: true, requiresPasswordChange: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid email or password.";
      return { success: false, error: message };
    }
  };

  // Synchronous from the caller's point of view — state clears immediately
  // so ProtectedRoute redirects at once, while the POST /auth/logout call
  // (best-effort refresh-token revocation) happens in the background.
  const logout = useCallback(() => {
    setUser(null);
    void authService.logout();
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const session = await authService.fetchCurrentUser();
      setUser(session);
    } catch {
      // Invalid/expired token — apiClient's 401 handler already cleared it.
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
