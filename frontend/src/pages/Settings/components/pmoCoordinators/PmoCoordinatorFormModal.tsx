import { useState } from "react";
import { AlertTriangle, Lock, UserPlus, Pencil } from "lucide-react";
import { Button } from "../../../../components/ui/Button";
import { Portal } from "../../../../components/ui/Portal";
import { ApiError } from "../../../../services/apiClient";
import {
  createPmoCoordinator,
  updatePmoCoordinator,
  type PmoCoordinatorEntry,
} from "../../../../services/pmoCoordinatorService";

interface Props {
  /** Absent = Add; present = Edit. */
  entry?: PmoCoordinatorEntry;
  onCancel: () => void;
  onSaved: (entry: PmoCoordinatorEntry) => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputClass =
  "w-full h-9 px-2.5 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] text-[12.5px] text-[var(--nu-text)] outline-none focus:ring-2 focus:ring-[var(--nu-accent)]/30 focus:border-[var(--nu-accent)] disabled:opacity-60 disabled:cursor-not-allowed";

/**
 * Add or edit a registry entry. The email is saved exactly as typed (only
 * surrounding spaces are removed) — never auto-corrected. Editing the email
 * is disabled while projects are assigned; the backend enforces the same
 * rule (and duplicate-email checks) regardless of what this form allows.
 */
export const PmoCoordinatorFormModal = ({
  entry,
  onCancel,
  onSaved,
}: Props) => {
  const isEdit = Boolean(entry);
  const emailLocked = isEdit && (entry?.assignedProjectCount ?? 0) > 0;
  const [displayName, setDisplayName] = useState(entry?.displayName ?? "");
  const [email, setEmail] = useState(entry?.email ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const trimmedName = displayName.trim();
  const trimmedEmail = email.trim();
  const isValid = trimmedName.length > 0 && EMAIL_PATTERN.test(trimmedEmail);
  const nameChanged = !entry || trimmedName !== entry.displayName;
  const emailChanged = !entry || trimmedEmail !== entry.email;
  const hasChanges = nameChanged || emailChanged;

  const handleSave = async () => {
    if (!isValid || !hasChanges || isSaving) return;
    setError("");
    setIsSaving(true);
    try {
      const saved = entry
        ? await updatePmoCoordinator(entry.id, {
            ...(nameChanged ? { displayName: trimmedName } : {}),
            ...(emailChanged && !emailLocked ? { email: trimmedEmail } : {}),
          })
        : await createPmoCoordinator({
            displayName: trimmedName,
            email: trimmedEmail,
          });
      onSaved(saved);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to save the PMO Coordinator. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        onClick={onCancel}
      >
        <div
          role="dialog"
          aria-modal="true"
          className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-[var(--nu-shadow-md)] w-full max-w-sm p-5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-[var(--nu-radius-md)] bg-[var(--nu-accent-soft)] text-[var(--nu-accent)] flex items-center justify-center shrink-0">
              {isEdit ? <Pencil size={18} /> : <UserPlus size={18} />}
            </div>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-[var(--nu-text)]">
                {isEdit ? "Edit PMO Coordinator" : "Add PMO Coordinator"}
              </h2>
              <p className="text-[12px] text-[var(--nu-text-secondary)] mt-1">
                {isEdit
                  ? entry?.displayName
                  : "The PMO Portal account is matched by email. It does not need to exist yet."}
              </p>
            </div>
          </div>

          {error && (
            <div className="mt-4 flex items-start gap-2 p-3 rounded-[var(--nu-radius-md)] bg-[var(--nu-danger-soft)] border border-[var(--nu-danger)]/30 text-[var(--nu-danger)] text-[11.5px] font-semibold">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-[var(--nu-text-secondary)] mb-1">
                Name
              </label>
              <input
                type="text"
                value={displayName}
                maxLength={200}
                onChange={(e) => setDisplayName(e.target.value)}
                className={inputClass}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--nu-text-secondary)] mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                maxLength={255}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                disabled={emailLocked}
              />
              {emailLocked && (
                <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-[var(--nu-text-muted)]">
                  <Lock size={11} className="shrink-0 mt-0.5" />
                  Assigned to {entry?.assignedProjectCount} project(s). Reassign
                  them before changing the email.
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2.5 mt-5">
            <Button
              variant="secondary"
              size="sm"
              onClick={onCancel}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={!isValid || !hasChanges || isSaving}
            >
              {isSaving
                ? "Saving..."
                : isEdit
                  ? "Save Changes"
                  : "Add Coordinator"}
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  );
};
