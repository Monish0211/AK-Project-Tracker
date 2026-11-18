import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./authContext";
import AccessNotConfigured from "../pages/AccessNotConfigured/AccessNotConfigured";

interface Props {
  children: React.ReactNode;
}

const CHANGE_PASSWORD_PATH = "/auth/change-password";

const ProtectedRoute: React.FC<Props> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[var(--nu-surface-alt)]">
        <div className="text-[14px] font-semibold text-[var(--nu-text-muted)] animate-pulse">
          Loading Portal Authentication...
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // A forced password change blocks every other route — Dashboard, Sidebar,
  // every module — until it's completed. This check runs on every protected
  // route (including the change-password page's own wrapper below), so the
  // explicit path comparison is what stops it from being a redirect loop.
  if (user.forcePasswordChange && location.pathname !== CHANGE_PASSWORD_PATH) {
    return <Navigate to={CHANGE_PASSWORD_PATH} replace />;
  }

  // Country access is being enforced and this account has none: no project or financial data is requested for it, and
  // access is never defaulted to India or All Countries. Only when enforcing — in "shadow" and "off" nothing is blocked.
  if (user.countryAccessMode === "enforce" && !user.countryAccessConfigured) {
    return <AccessNotConfigured />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
