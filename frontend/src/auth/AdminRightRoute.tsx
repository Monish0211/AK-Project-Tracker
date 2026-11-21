import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAdminRights } from "../hooks/useAdminRights";
import type { AdminControlRight } from "../services/adminControlsService";

/**
 * Administrative Controls: a page only for holders of one administrative right (Settings > Administrative Controls). The server re-checks the
 * right on every call, so this only keeps the page from opening for anyone else; it is never the authority.
 */
export function AdminRightRoute({ right, children }: { right: AdminControlRight; children: ReactNode }) {
  const { holds, loaded } = useAdminRights();
  if (!loaded) return <div className="py-12 text-center text-[var(--nu-text-muted)]">Loading...</div>;
  if (!holds(right)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
