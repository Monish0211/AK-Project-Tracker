import { useState } from "react";
import { KeyRound, Copy, Check, Info, AlertTriangle } from "lucide-react";
import type { User } from "../../../../types/UserModel";
import { resetUserPassword } from "../../../../services/userManagementService";
import { ApiError } from "../../../../services/apiClient";
import { Button } from "../../../../components/ui/Button";

interface ResetPasswordDialogProps {
  user: User;
  onCancel: () => void;
  onDone: () => void;
}

export const ResetPasswordDialog = ({ user, onCancel, onDone }: ResetPasswordDialogProps) => {
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    setError("");
    setIsResetting(true);
    try {
      const generated = await resetUserPassword(user.id);
      if (generated) setNewPassword(generated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsResetting(false);
    }
  };

  const handleCopy = () => {
    if (!newPassword) return;
    navigator.clipboard.writeText(newPassword).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={newPassword ? undefined : onCancel}>
      <div
        className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-[var(--nu-shadow-md)] w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-[var(--nu-radius-md)] bg-amber-500/15 text-amber-600 flex items-center justify-center shrink-0">
            <KeyRound size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-[var(--nu-text)]">Reset Password?</h2>
            <p className="text-[12.5px] text-[var(--nu-text-secondary)] mt-1">
              Generate a new temporary password for{" "}
              <span className="font-medium text-[var(--nu-text)]">{user.employeeName}</span>. Their current
              password will stop working immediately.
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 p-3 rounded-[var(--nu-radius-md)] bg-[var(--nu-danger-soft)] border border-[var(--nu-danger)]/30 text-[var(--nu-danger)] text-[11.5px] font-semibold">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {newPassword && (
          <div className="mt-4 space-y-2.5">
            <div className="flex items-center justify-between p-3 rounded-[var(--nu-radius-md)] bg-[var(--nu-surface-alt)] border border-[var(--nu-border)]">
              <span className="font-mono text-[13px] font-bold text-[var(--nu-text)]">{newPassword}</span>
              <button
                type="button"
                onClick={handleCopy}
                className="w-7 h-7 rounded-[var(--nu-radius-md)] text-[var(--nu-text-secondary)] hover:bg-[var(--nu-surface)] flex items-center justify-center transition-colors cursor-pointer"
                title="Copy password"
              >
                {copied ? <Check size={14} className="text-[var(--nu-success)]" /> : <Copy size={14} />}
              </button>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-[var(--nu-radius-md)] bg-[var(--nu-info)]/10 border border-[var(--nu-info)]/30 text-[11.5px] leading-snug text-[var(--nu-text-secondary)]">
              <Info size={14} className="text-[var(--nu-info)] shrink-0 mt-0.5" />
              <span>Share this password securely. The user will be required to set a new password on their next login.</span>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2.5 mt-5">
          {newPassword ? (
            <Button variant="primary" size="sm" onClick={onDone}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={onCancel} disabled={isResetting}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleConfirm} disabled={isResetting}>
                {isResetting ? "Resetting..." : "Reset Password"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
