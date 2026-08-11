import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { KeyRound, Check } from "lucide-react";
import { useAuth } from "../../auth/authContext";
import { authService } from "../../auth/authService";
import { ApiError } from "../../services/apiClient";
import { getPasswordStrength } from "../../utils/passwordStrength";
import { Button } from "../../components/ui/Button";
import { PasswordField } from "../../components/ui/PasswordField";

const STRENGTH_BAR_COLOR: Record<number, string> = {
  0: "bg-[var(--nu-danger)]",
  1: "bg-[var(--nu-danger)]",
  2: "bg-[var(--nu-warning)]",
  3: "bg-[var(--nu-accent)]",
  4: "bg-[var(--nu-success)]",
};

/**
 * Standalone page — no Sidebar, no Navbar. Serves two distinct callers:
 * (1) an already-authenticated user whose forcePasswordChange flipped true
 * mid-session (ProtectedRoute redirects them here, session/JWT intact —
 * self-service /auth/change-password is used); (2) a brand-new user just
 * bounced straight from Login.tsx with no session at all, because login()
 * withheld the JWT — identified only by `location.state.email`, using the
 * unauthenticated /auth/change-first-password endpoint instead. Neither
 * signal present means there's nothing for this page to do here.
 */
export default function ChangePassword() {
  const { user, loading, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const stateEmail = (location.state as { email?: string } | null)?.email;
  const isForcedFirstLogin = !user && !!stateEmail;

  useEffect(() => {
    if (!loading && !user && !stateEmail) {
      navigate("/login", { replace: true });
    }
  }, [loading, user, stateEmail, navigate]);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const strength = getPasswordStrength(newPassword);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!currentPassword) {
      setError("Current password is required.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirm password do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("New password must be different from your current password.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (isForcedFirstLogin && stateEmail) {
        await authService.changeFirstPassword(stateEmail, currentPassword, newPassword, confirmPassword);
      } else {
        await authService.changePassword(currentPassword, newPassword, confirmPassword);
      }
      setIsSuccess(true);
      // Either branch above already persisted a fresh token — pull the
      // profile into AuthContext so ProtectedRoute stops redirecting here.
      await refreshUser();
      setTimeout(() => navigate("/", { replace: true }), 1200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return null;
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[var(--nu-surface-alt)] px-4">
      <div className="w-full max-w-md bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-[var(--nu-shadow-md)] p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-[var(--nu-accent-soft)] text-[var(--nu-accent)] flex items-center justify-center mb-3">
            <KeyRound size={26} />
          </div>
          <h1 className="text-lg font-bold text-[var(--nu-text)]">Change Your Password</h1>
          <p className="text-[13px] text-[var(--nu-text-muted)] mt-1.5 leading-relaxed">
            For your account's security, you must set a new password before continuing.
          </p>
        </div>

        {isSuccess ? (
          <div className="flex flex-col items-center text-center gap-3 py-4">
            <div className="w-12 h-12 rounded-full bg-[var(--nu-success-soft)] text-[var(--nu-success)] flex items-center justify-center">
              <Check size={24} />
            </div>
            <p className="text-[13.5px] font-semibold text-[var(--nu-text)]">Password changed successfully.</p>
            <p className="text-[12px] text-[var(--nu-text-muted)]">Redirecting to your Dashboard…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-[var(--nu-radius-md)] bg-[var(--nu-danger-soft)] border border-[var(--nu-danger)]/30 text-[var(--nu-danger)] text-[12.5px] font-semibold">
                {error}
              </div>
            )}

            <PasswordField
              label="Current Password"
              value={currentPassword}
              onChange={setCurrentPassword}
              show={showCurrent}
              onToggleShow={() => setShowCurrent((v) => !v)}
              autoComplete="current-password"
            />

            <div>
              <PasswordField
                label="New Password"
                value={newPassword}
                onChange={setNewPassword}
                show={showNew}
                onToggleShow={() => setShowNew((v) => !v)}
                autoComplete="new-password"
              />
              {newPassword && (
                <div className="mt-2">
                  <div className="flex gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={`h-1.5 flex-1 rounded-full transition-colors ${
                          i < strength.score ? STRENGTH_BAR_COLOR[strength.score] : "bg-[var(--nu-border)]"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-[11px] font-semibold text-[var(--nu-text-muted)] mt-1">Strength: {strength.label}</p>
                </div>
              )}
              <p className="text-[11px] text-[var(--nu-text-muted)] mt-1.5">
                Minimum 8 characters, with at least one letter and one number.
              </p>
            </div>

            <PasswordField
              label="Confirm New Password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              show={showConfirm}
              onToggleShow={() => setShowConfirm((v) => !v)}
              autoComplete="new-password"
            />

            <Button type="submit" variant="primary" size="md" className="w-full justify-center" disabled={isSubmitting}>
              {isSubmitting ? "Changing Password..." : "Change Password"}
            </Button>

            <button
              type="button"
              onClick={isForcedFirstLogin ? () => navigate("/login", { replace: true }) : logout}
              className="w-full text-center text-[12px] font-semibold text-[var(--nu-text-muted)] hover:text-[var(--nu-text)] transition-colors cursor-pointer bg-transparent border-none"
            >
              {isForcedFirstLogin ? "Back to Sign In" : "Sign out instead"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
