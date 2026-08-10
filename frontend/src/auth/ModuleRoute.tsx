import type { ReactNode } from "react";
import { useAuth } from "./authContext";
import { hasModuleAccess } from "./permissions";
import AccessDenied from "../pages/AccessDenied/AccessDenied";

interface ModuleRouteProps {
  module: string;
  children: ReactNode;
}

/**
 * Gates a single route by module permission. Only ever rendered inside
 * ProtectedRoute (which already guarantees `user` is loaded and non-null),
 * but still treats a null user as "no access" defensively.
 */
export function ModuleRoute({ module, children }: ModuleRouteProps) {
  const { user } = useAuth();

  if (!hasModuleAccess(user, module)) {
    return <AccessDenied moduleName={module} />;
  }

  return <>{children}</>;
}
