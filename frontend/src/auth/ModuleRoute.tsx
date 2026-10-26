import type { ReactNode } from "react";
import { useAuth } from "./authContext";
import { describeMissingModule, meetsModuleRequirement, type ModuleRequirement } from "./permissions";
import AccessDenied from "../pages/AccessDenied/AccessDenied";

interface ModuleRouteProps extends ModuleRequirement {
  children: ReactNode;
}

/**
 * Gates a single route by module permission. Only ever rendered inside
 * ProtectedRoute (which already guarantees `user` is loaded and non-null),
 * but still treats a null user as "no access" defensively.
 */
export function ModuleRoute({ module, anyOf, alsoRequires, children }: ModuleRouteProps) {
  const { user } = useAuth();
  const requirement: ModuleRequirement = { module, anyOf, alsoRequires };

  if (!meetsModuleRequirement(user, requirement)) {
    return <AccessDenied moduleName={describeMissingModule(user, requirement)} />;
  }

  return <>{children}</>;
}
