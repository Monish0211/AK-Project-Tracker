import { useCallback, useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Portal } from "../../components/ui/Portal";
import { loadProjectInvoiceContext } from "../../services/invoiceTrackerService";
import type { Project } from "../../types/Project";
import { InvoiceActionDrawer } from "../Projects/components/Invoice/InvoiceActionDrawer";
import { useInvoiceLineActions } from "../Projects/components/Invoice/useInvoiceLineActions";
import { usePagedRequest } from "../Settings/components/weeklyEmails/useWeeklyEmailPaging";
import type { TrackerAction } from "./InvoiceChain";
import type { RaiseWithoutEmailState } from "../Projects/components/Invoice/useRaiseWithoutEmail";

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <Portal>
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
        <div className="max-w-sm w-full rounded-[var(--nu-radius-lg)] bg-[var(--nu-surface)] border border-[var(--nu-border)] shadow-[var(--nu-shadow-md)] p-5 text-center space-y-3">{children}</div>
      </div>
    </Portal>
  );
}

/**
 * Runs View / Edit / Delete for one invoice line from Invoice Tracker with the EXISTING invoice interfaces: the same
 * RaiseInvoiceDrawer (view / edit — Invoice Header Details + Billable Line Items), the same "Delete Invoice?"
 * confirmation, and the same save path as Edit Project → Invoices (useInvoiceLineActions), so the same validation,
 * backend endpoints, approval gates and status-history recording apply. The project is loaded fresh from the API
 * first; nothing is opened against partial data.
 */
export function InvoiceActionHost({ action, onClose, onSaving, onSettled, raiseWithoutEmail }: { action: TrackerAction; onClose: () => void; onSaving: () => void; onSettled: () => void; raiseWithoutEmail?: RaiseWithoutEmailState }) {
  const fetcher = useCallback(() => loadProjectInvoiceContext(action.projectId), [action.projectId]);
  const load = usePagedRequest(fetcher, `${action.projectId}:${action.lineId}:${action.mode}`);

  if (load.error && !load.data) {
    return (
      <Overlay>
        <p className="text-[13px] font-semibold text-[var(--nu-text)]">Couldn't open the invoice</p>
        <p className="text-[12px] text-[var(--nu-text-muted)]">{load.error}</p>
        <div className="flex justify-center gap-2">
          <Button variant="secondary" size="sm" onClick={load.retry}>
            Try again
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </Overlay>
    );
  }
  if (!load.data && action.mode === "delete") {
    // The confirmation does not need the project to be asked: it is on screen immediately, and Delete becomes available once the
    // project (needed to act on) has loaded behind it.
    return <ConfirmDialog open variant="danger" title="Delete Invoice?" message={`Delete invoice ${action.invoiceNo}? This cannot be undone.`} confirmLabel="Delete" cancelLabel="Cancel" confirmDisabled onCancel={onClose} onConfirm={() => undefined} />;
  }
  if (!load.data) {
    return (
      <Overlay>
        <p className="text-[12.5px] text-[var(--nu-text-muted)]" role="status">
          Loading invoice…
        </p>
      </Overlay>
    );
  }
  return <HostInner initialProject={load.data} action={action} onClose={onClose} onSaving={onSaving} onSettled={onSettled} raiseWithoutEmail={raiseWithoutEmail} />;
}

function HostInner({ initialProject, action, onClose, onSaving, onSettled, raiseWithoutEmail }: { initialProject: Project; action: TrackerAction; onClose: () => void; onSaving: () => void; onSettled: () => void; raiseWithoutEmail?: RaiseWithoutEmailState | undefined }) {
  const [project, setProject] = useState<Project>(initialProject);
  const item = project.invoiceItems.find((i) => i.id === action.quantityItemId);
  const line = item?.invoices.find((l) => l.id === action.lineId);
  const [confirmDelete, setConfirmDelete] = useState(action.mode === "delete");
  const [deleteReason, setDeleteReason] = useState("");

  const actions = useInvoiceLineActions({
    project,
    setProject,
    onSaving,
    onSettled,
    suppressEmail: raiseWithoutEmail?.active ?? false,
    onSuppressedRaise: raiseWithoutEmail?.consume,
    initialDrawer: action.mode !== "delete" && item && line ? { item, mode: action.mode, existingLine: line } : null,
  });

  // When the drawer closes (Cancel, or Save — which hands the write to the shared save path), this host is done.
  const drawerClosed = action.mode !== "delete" && !actions.drawerState;
  useEffect(() => {
    if (drawerClosed && line) onClose();
  }, [drawerClosed, line, onClose]);

  if (!item || !line) {
    return (
      <Overlay>
        <p className="text-[13px] font-semibold text-[var(--nu-text)]">This invoice no longer exists</p>
        <p className="text-[12px] text-[var(--nu-text-muted)]">It was changed or deleted since the list was loaded.</p>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            onSettled();
            onClose();
          }}
        >
          Close
        </Button>
      </Overlay>
    );
  }

  // Administrative Controls (D3): only a Draft is deleted as before. A raised / cancelled invoice needs an Invoice Administration holder and a
  // reason (archived, number kept); a paid one is never deleted. Same rules and dialog wording as Edit Project -> Invoices.
  const isDraft = line.status === "Draft";
  const isPaid = line.status === "Paid" || line.status === "PartiallyPaid";
  const mayAdminDelete = !isDraft && !isPaid && (raiseWithoutEmail?.available ?? false);
  const refused = !isDraft && !mayAdminDelete;
  return (
    <>
      {action.mode !== "delete" && <InvoiceActionDrawer project={project} actions={actions} />}
      <ConfirmDialog
        open={confirmDelete}
        variant="danger"
        title={refused ? "This invoice cannot be deleted here" : mayAdminDelete ? "Delete raised invoice? (Administrator)" : "Delete Invoice?"}
        message={
          refused ? (
            isPaid
              ? `Invoice ${line.invoiceNo} is ${line.status}. A paid or partly paid invoice is never deleted; reverse the payment and correct its status first.`
              : `Invoice ${line.invoiceNo} is ${line.status}. Only an Invoice Administration holder can delete a raised invoice. Use Cancel to void it instead.`
          ) : mayAdminDelete ? (
            <span className="block space-y-2">
              <span className="block">
                Invoice {line.invoiceNo} is {line.status}. It will be removed from every figure; a full copy is archived and its number stays reserved.
                Use Cancel instead if it should stay visible.
              </span>
              <textarea
                aria-label="Reason for deleting this invoice"
                placeholder="Reason (required, at least 5 characters)"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                className="w-full rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-3 py-2 text-[12.5px] text-[var(--nu-text)] outline-none focus:ring-2 focus:ring-[var(--nu-accent)]/30 min-h-[64px]"
              />
            </span>
          ) : (
            `Delete invoice ${line.invoiceNo}? This cannot be undone.`
          )
        }
        confirmLabel={refused ? "Close" : "Delete"}
        cancelLabel="Cancel"
        confirmDisabled={mayAdminDelete && deleteReason.trim().length < 5}
        onCancel={() => {
          setConfirmDelete(false);
          onClose();
        }}
        onConfirm={() => {
          setConfirmDelete(false);
          if (refused) {
            onClose();
            return;
          }
          if (mayAdminDelete) {
            void actions.adminDeleteRaisedInvoiceLine(line, deleteReason.trim()).finally(onClose);
            return;
          }
          actions.deleteInvoiceLine(item, line);
          onClose();
        }}
      />
    </>
  );
}
