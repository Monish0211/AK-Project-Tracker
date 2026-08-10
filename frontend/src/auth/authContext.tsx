import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authService } from "./authService";
import type { UserSession } from "./authService";

export interface LoginResult {
  success: boolean;
  error?: string;
}

interface AuthContextType {
  user: UserSession | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => void;
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
      const session = await authService.login(email, password);
      setUser(session);
      return { success: true };
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

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
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
