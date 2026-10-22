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
export function InvoiceActionHost({ action, onClose, onSaving, onSettled }: { action: TrackerAction; onClose: () => void; onSaving: () => void; onSettled: () => void }) {
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
  return <HostInner initialProject={load.data} action={action} onClose={onClose} onSaving={onSaving} onSettled={onSettled} />;
}

function HostInner({ initialProject, action, onClose, onSaving, onSettled }: { initialProject: Project; action: TrackerAction; onClose: () => void; onSaving: () => void; onSettled: () => void }) {
  const [project, setProject] = useState<Project>(initialProject);
  const item = project.invoiceItems.find((i) => i.id === action.quantityItemId);
  const line = item?.invoices.find((l) => l.id === action.lineId);
  const [confirmDelete, setConfirmDelete] = useState(action.mode === "delete");

  const actions = useInvoiceLineActions({
    project,
    setProject,
    onSaving,
    onSettled,
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

  return (
    <>
      {action.mode !== "delete" && <InvoiceActionDrawer project={project} actions={actions} />}
      <ConfirmDialog
        open={confirmDelete}
        variant="danger"
        title="Delete Invoice?"
        message={`Delete invoice ${line.invoiceNo}? This cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onCancel={() => {
          setConfirmDelete(false);
          onClose();
        }}
        onConfirm={() => {
          setConfirmDelete(false);
          actions.deleteInvoiceLine(item, line);
          onClose();
        }}
      />
    </>
  );
}
