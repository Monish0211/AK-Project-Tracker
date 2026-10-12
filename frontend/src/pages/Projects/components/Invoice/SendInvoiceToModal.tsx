import { useEffect, useState } from "react";
import { Send, X } from "lucide-react";
import type { InvoiceItem, InvoiceLine } from "../../../../types/InvoiceItem";
import type { UserByRole } from "../../../../types/PRRequest";
import { Button } from "../../../../components/ui/Button";
import { FormLabel } from "../../../../components/ui/FormLabel";
import { Portal } from "../../../../components/ui/Portal";
import { usePmoToast } from "../../../../components/ui/usePmoToast";
import { getUserFriendlyErrorMessage } from "../../../../utils/errorMessage";
import { getUsersByRole } from "../../../../services/prRequestService";
import { sendInvoiceLineTo } from "../../../../services/invoiceService";
import { formatLineAmountWithEquivalent } from "./invoiceCurrency";

interface Props {
  item: InvoiceItem;
  line: InvoiceLine;
  onClose: () => void;
}

/**
 * Request Invoice workflow — Section C: "Send Invoice To." A separate,
 * MANUAL action taken AFTER an invoice has already, successfully been
 * raised (this modal is only ever opened from an already-saved Invoice
 * History row — see InvoiceHistory.tsx's onSendInvoiceTo). Recipients are
 * any active user (reuses the existing GET /users/by-role lookup with no
 * role filter — the same "every active user" list the PR Request Accounts
 * Approver picker already uses), deliberately NOT restricted to users
 * holding "Raise Invoice" — sharing an already-raised invoice's result is a
 * different action from being trusted to raise one.
 */
export function SendInvoiceToModal({ item, line, onClose }: Props) {
  const { showToast } = usePmoToast();
  const [activeUsers, setActiveUsers] = useState<UserByRole[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getUsersByRole()
      .then((users) => {
        if (!cancelled) setActiveUsers(users);
      })
      .catch((error) => {
        if (!cancelled) {
          showToast({ type: "error", title: "Failed to load users", message: getUserFriendlyErrorMessage(error) });
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingUsers(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id]));
  };

  const handleSubmit = async () => {
    if (selectedIds.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await sendInvoiceLineTo(line.id, selectedIds);
      showToast({ type: "success", title: "Invoice shared successfully", message: "The selected recipients have been notified." });
      onClose();
    } catch (error) {
      showToast({ type: "error", title: "Failed to share invoice", message: getUserFriendlyErrorMessage(error) });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4" onClick={onClose}>
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md bg-[var(--nu-surface)] rounded-2xl shadow-2xl border border-[var(--nu-border)] overflow-hidden"
        >
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--nu-border)] bg-white dark:bg-slate-900">
            <h2 className="text-[16px] font-bold text-[var(--nu-text)]">Send Invoice To</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-[var(--nu-text-muted)] hover:bg-[var(--nu-surface-alt)] hover:text-[var(--nu-text)] transition cursor-pointer"
              aria-label="Close"
            >
              <X size={19} />
            </button>
          </div>

          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-[12.5px] rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] p-3">
              <div>
                <span className="text-[var(--nu-text-muted)]">Invoice No</span>
                <p className="font-semibold text-[var(--nu-text)]">{line.invoiceNo}</p>
              </div>
              <div>
                <span className="text-[var(--nu-text-muted)]">Amount</span>
                <p className="font-semibold text-[var(--nu-text)]">{formatLineAmountWithEquivalent(line)}</p>
              </div>
              <div className="col-span-2">
                <span className="text-[var(--nu-text-muted)]">Activity</span>
                <p className="font-semibold text-[var(--nu-text)] truncate">{item.description}</p>
              </div>
            </div>

            <div>
              <FormLabel required>Recipients</FormLabel>
              {isLoadingUsers ? (
                <p className="text-[12px] text-[var(--nu-text-muted)]">Loading users...</p>
              ) : (
                <div className="max-h-56 overflow-y-auto nu-scrollbar rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] divide-y divide-[var(--nu-border)]">
                  {activeUsers.map((u) => (
                    <label
                      key={u.id}
                      className="flex items-center gap-2.5 px-3 py-2 text-[12.5px] cursor-pointer hover:bg-[var(--nu-surface-alt)]"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(u.id)}
                        onChange={() => toggleSelected(u.id)}
                        className="accent-[var(--nu-accent)]"
                      />
                      <span className="text-[var(--nu-text)]">{u.fullName}</span>
                    </label>
                  ))}
                  {activeUsers.length === 0 && (
                    <p className="px-3 py-2 text-[12px] text-[var(--nu-text-muted)]">No active users found.</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 px-5 py-4 border-t border-[var(--nu-border)] bg-white dark:bg-slate-900">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Send size={14} />}
              onClick={handleSubmit}
              disabled={selectedIds.length === 0 || isSubmitting}
            >
              {isSubmitting ? "Sending..." : "Send"}
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
