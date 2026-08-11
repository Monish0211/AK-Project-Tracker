import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { KeyRound, Check, ShieldAlert } from "lucide-react";
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

type TokenStatus = "checking" | "valid" | "invalid";

/**
 * Reached via the Forgot Password email's Reset Password button
 * (?token=...) — fully unauthenticated, standalone like Login.tsx. The
 * token is validated once on mount (GET /auth/validate-reset-token, which
 * never consumes it) before the New Password form is shown at all.
 */
export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const navigate = useNavigate();

  const [tokenStatus, setTokenStatus] = useState<TokenStatus>(token ? "checking" : "invalid");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const strength = getPasswordStrength(newPassword);

  useEffect(() => {
    if (!token) {
      return;
    }

    let isMounted = true;

    authService
      .validateResetToken(token)
      .then((valid) => {
        if (isMounted) setTokenStatus(valid ? "valid" : "invalid");
      })
      .catch(() => {
        if (isMounted) setTokenStatus("invalid");
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirm password do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      await authService.resetPassword(token, newPassword, confirmPassword);
      setIsSuccess(true);
      setTimeout(() => navigate("/login", { replace: true }), 1800);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[var(--nu-surface-alt)] px-4">
      <div className="w-full max-w-md bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-[var(--nu-shadow-md)] p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-[var(--nu-accent-soft)] text-[var(--nu-accent)] flex items-center justify-center mb-3">
            <KeyRound size={26} />
          </div>
          <h1 className="text-lg font-bold text-[var(--nu-text)]">Reset Your Password</h1>
        </div>

        {tokenStatus === "checking" && (
          <p className="text-center text-[13px] text-[var(--nu-text-muted)] py-4">Validating your reset link...</p>
        )}

        {tokenStatus === "invalid" && (
          <div className="flex flex-col items-center text-center gap-3 py-2">
            <div className="w-12 h-12 rounded-full bg-[var(--nu-danger-soft)] text-[var(--nu-danger)] flex items-center justify-center">
              <ShieldAlert size={24} />
            </div>
            <p className="text-[13.5px] font-semibold text-[var(--nu-text)]">
              This password reset link is invalid or has expired.
            </p>
            <Link
              to="/login"
              className="text-[12.5px] font-semibold text-[var(--nu-accent)] hover:underline mt-1"
            >
              Back to Sign In
            </Link>
          </div>
        )}

        {tokenStatus === "valid" && isSuccess && (
          <div className="flex flex-col items-center text-center gap-3 py-4">
            <div className="w-12 h-12 rounded-full bg-[var(--nu-success-soft)] text-[var(--nu-success)] flex items-center justify-center">
              <Check size={24} />
            </div>
            <p className="text-[13.5px] font-semibold text-[var(--nu-text)]">Password reset successfully.</p>
            <p className="text-[12px] text-[var(--nu-text-muted)]">Redirecting to Sign In…</p>
          </div>
        )}

        {tokenStatus === "valid" && !isSuccess && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-[var(--nu-radius-md)] bg-[var(--nu-danger-soft)] border border-[var(--nu-danger)]/30 text-[var(--nu-danger)] text-[12.5px] font-semibold">
                {error}
              </div>
            )}

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
              {isSubmitting ? "Resetting Password..." : "Reset Password"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
