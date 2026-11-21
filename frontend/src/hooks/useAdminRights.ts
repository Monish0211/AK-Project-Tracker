import { useEffect, useState } from "react";
import { useAuth } from "../auth/authContext";
import { adminControlsService, type AdminControlRight } from "../services/adminControlsService";

/**
 * Which administrative rights the signed-in user holds - only to decide which controls to SHOW. The server re-checks the right on every call,
 * so this is never the authority. Non-Administrators never call the endpoint (they cannot hold a right). One request per user per page load,
 * shared by every component that asks (the PR Requests page, the invoice screens).
 */
let cache: { userId: string; promise: Promise<AdminControlRight[]> } | null = null;

function loadFor(userId: string): Promise<AdminControlRight[]> {
  if (!cache || cache.userId !== userId) {
    cache = {
      userId,
      promise: adminControlsService
        .getMyRights()
        .then((r) => r.rights)
        .catch(() => {
          cache = null; // retried next time; meanwhile no administrative control is shown
          return [] as AdminControlRight[];
        }),
    };
  }
  return cache.promise;
}

/** Test seam / after a sign-out. */
export function resetAdminRightsCache(): void {
  cache = null;
}

export function useAdminRights(): { rights: AdminControlRight[]; holds: (right: AdminControlRight) => boolean; loaded: boolean } {
  const { user } = useAuth();
  const isAdministrator = user?.role === "Administrator";
  const userId = user?.id ?? "";
  const [state, setState] = useState<{ userId: string; rights: AdminControlRight[] } | null>(null);

  useEffect(() => {
    if (!isAdministrator || !userId) return;
    let cancelled = false;
    void loadFor(userId).then((rights) => {
      if (!cancelled) setState({ userId, rights });
    });
    return () => {
      cancelled = true;
    };
  }, [isAdministrator, userId]);

  const rights = isAdministrator && state?.userId === userId ? state.rights : [];
  return { rights, holds: (right) => rights.includes(right), loaded: !isAdministrator || state?.userId === userId };
}
