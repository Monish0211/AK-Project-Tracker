import type { User } from "../../../../types/UserModel";
import { ConfirmDialog } from "../../../../components/ui/ConfirmDialog";

interface DeleteUserDialogProps {
  user: User;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Thin wrapper around the PMO-wide ConfirmDialog — this component's own
 * public API (user/onCancel/onConfirm) is unchanged, so its one call site
 * in UserManagementSection.tsx needs no edit. Delegating to ConfirmDialog
 * picks up its accessibility (role, aria-*, Escape-to-close, focus
 * management) and document-level Portal mounting for free, and removes the
 * near-duplicate markup this file used to hand-roll.
 */
export const DeleteUserDialog = ({ user, onCancel, onConfirm }: DeleteUserDialogProps) => {
  return (
    <ConfirmDialog
      open
      variant="danger"
      title="Delete User?"
      message={
        <>
          Remove <span className="font-medium text-[var(--nu-text)]">{user.employeeName}</span> ({user.employeeId}) from
          the user directory? This action cannot be undone.
        </>
      }
      confirmLabel="Delete User"
      cancelLabel="Cancel"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
};
