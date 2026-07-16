import React, { createContext, useContext, useState, useEffect } from "react";
import { authService } from "./authService";
import type { UserSession } from "./authService";

interface AuthContextType {
  user: UserSession | null;
  loading: boolean;
  login: (employeeId: string, password: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = authService.getCurrentSession();
    setUser(session);
    setLoading(false);
  }, []);

  const login = (employeeId: string, password: string): boolean => {
    const session = authService.login(employeeId, password);
    if (session) {
      setUser(session);
      return true;
    }
    return false;
  };

  const logout = () => {
    authService.logout();
    setUser(null);
  };

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
