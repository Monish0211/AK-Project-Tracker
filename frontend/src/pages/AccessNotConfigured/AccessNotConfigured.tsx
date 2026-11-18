import { useState } from "react";
import { useAuth } from "../../auth/authContext";

/**
 * Shown instead of the portal when country access is being enforced and this account has no country assigned.
 * No project or financial data is requested for this account. Access is never defaulted to India or All Countries:
 * an Administrator must assign it.
 */
export default function AccessNotConfigured() {
  const { user, logout, refreshUser } = useAuth();
  const [checking, setChecking] = useState(false);

  const checkAgain = async () => {
    setChecking(true);
    try {
      await refreshUser();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-[var(--nu-surface-alt)] px-4">
      <div
        data-testid="access-not-configured"
        className="w-full max-w-md rounded-[var(--nu-radius-lg,12px)] border border-[var(--nu-border)] bg-[var(--nu-surface)] p-6 text-center shadow-sm"
      >
        <h1 className="text-[18px] font-bold text-[var(--nu-text)]">Country access not configured</h1>
        <p className="mt-2 text-[13px] text-[var(--nu-text-muted)]">
          {user ? `${user.name}, your` : "Your"} account has not been given access to any country yet, so no project or
          financial information can be shown.
        </p>
        <p className="mt-2 text-[13px] text-[var(--nu-text-muted)]">
          Please ask your PMO Portal Administrator to assign the countries you work in, then choose “Check again”.
        </p>
        <div className="mt-5 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={checkAgain}
            disabled={checking}
            className="rounded-lg bg-[var(--nu-accent)] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60 cursor-pointer"
          >
            {checking ? "Checking…" : "Check again"}
          </button>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg border border-[var(--nu-border)] px-4 py-2 text-[13px] font-semibold text-[var(--nu-text)] cursor-pointer"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
