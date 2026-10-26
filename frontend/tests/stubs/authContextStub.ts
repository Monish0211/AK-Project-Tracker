// Test double for src/auth/authContext.tsx (whose AuthContext is not exported and whose provider fetches /auth/me).
// moduleAccessPermissions.test.mjs aliases every `authContext` import to this file and sets the signed-in user per render.
export const useAuth = () => ({
  user: (globalThis as { __permTestUser?: unknown }).__permTestUser ?? null,
  loading: false,
  login: async () => ({ success: false }),
  logout: () => undefined,
  refreshUser: async () => undefined,
});
