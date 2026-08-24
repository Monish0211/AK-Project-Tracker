import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";

interface Props {
  customerName: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Thin wrapper around the PMO-wide ConfirmDialog — public API (customerName/
 * onCancel/onConfirm) unchanged, so the call site in CustomerMaster.tsx
 * needs no edit. Delegating to ConfirmDialog picks up its accessibility
 * (role, aria-*, Escape-to-close, focus management) and document-level
 * Portal mounting for free.
 */
const ConfirmDeleteDialog = ({ customerName, onCancel, onConfirm }: Props) => {
  return (
    <ConfirmDialog
      open
      variant="danger"
      title="Delete Customer?"
      message={
        <>
          Remove <span className="font-medium text-[var(--nu-text)]">"{customerName}"</span>? This action cannot be
          undone.
        </>
      }
      confirmLabel="Delete"
      cancelLabel="Cancel"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
};

export default ConfirmDeleteDialog;
