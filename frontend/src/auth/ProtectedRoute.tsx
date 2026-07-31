import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./authContext";

interface Props {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<Props> = ({ children }) => {
  const { user, loading } = useAuth();

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

  return <>{children}</>;
};

export default ProtectedRoute;
