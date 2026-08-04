import { AlertTriangle } from "lucide-react";
import type { User } from "../../../../types/UserModel";
import { Button } from "../../../../components/ui/Button";

interface DeleteUserDialogProps {
  user: User;
  onCancel: () => void;
  onConfirm: () => void;
}

export const DeleteUserDialog = ({ user, onCancel, onConfirm }: DeleteUserDialogProps) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div
        className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-[var(--nu-shadow-md)] w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-[var(--nu-radius-md)] bg-[var(--nu-danger-soft)] text-[var(--nu-danger)] flex items-center justify-center shrink-0">
            <AlertTriangle size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-[var(--nu-text)]">Delete User?</h2>
            <p className="text-[12.5px] text-[var(--nu-text-secondary)] mt-1">
              Remove <span className="font-medium text-[var(--nu-text)]">{user.employeeName}</span> ({user.employeeId})
              from the user directory? This action cannot be undone.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2.5 mt-5">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm}>
            Delete User
          </Button>
        </div>
      </div>
    </div>
  );
};
