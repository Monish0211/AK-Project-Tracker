import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ListChecks } from "lucide-react";

import type { Project } from "../../../../types/Project";
import type { InvoiceItem, InvoiceLine, InvoiceLineStatus } from "../../../../types/InvoiceItem";
import type { InvoiceRequest } from "../../../../types/InvoiceRequest";
import { updateProject } from "../../../../services/projectService";
import { fetchInvoiceItemsFromApi, fetchProjectInvoiceCurrency, syncInvoiceLinesWithApi } from "../../../../services/invoiceService";
import { ApiError } from "../../../../services/apiClient";
import { getInvoiceRequestsForProject } from "../../../../services/invoiceRequestService";
import { useAuth } from "../../../../auth/authContext";
import { hasApprovalPermission } from "../../../../auth/permissions";

import { CommercialSummary } from "./CommercialSummary";
import { InvoiceSummaryPanel } from "./InvoiceSummaryPanel";
import { ActivitiesTable } from "./ActivitiesTable";
import { RaiseInvoiceDrawer } from "./RaiseInvoiceDrawer";
import { RaiseInvoiceCycleModal } from "./RaiseInvoiceCycleModal";
import { InvoiceWorkspaceModal } from "./InvoiceWorkspaceModal";
import { LumpSumInvoiceWorkspaceModal } from "./LumpSumInvoiceWorkspaceModal";
import { MlmpInvoiceWorkspaceModal } from "./MlmpInvoiceWorkspaceModal";
import { AmountBasedInvoiceWorkspaceModal } from "./AmountBasedInvoiceWorkspaceModal";
import { InvoiceHistory } from "./InvoiceHistory";
import { PrintInvoiceModal } from "./PrintInvoiceModal";
import { RequestInvoiceModal } from "./RequestInvoiceModal";
import { SendInvoiceToModal } from "./SendInvoiceToModal";
import { InvoiceRequestStatusIndicator } from "./InvoiceRequestStatusIndicator";
import { getInvoiceMethod, getInvoiceCyclesForProject, NEW_INVOICE_CYCLE } from "./InvoiceCalculations";
import { logInvoiceDeletedAudit, logInvoiceCycleStatusChangedAudit } from "../../../../services/projectAuditService";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { Card, CardBody } from "../../../../components/ui/Card";
import { usePmoToast } from "../../../../components/ui/usePmoToast";

interface Props {
  project: Project;
  /** Omit to mount this in a read-only context — e.g. View Project's Invoices tab. */
  setProject?: Dispatch<SetStateAction<Project>>;
  readOnly?: boolean;
  /** Deep-linked from a notification (e.g. "Outstanding Payment") — auto-expands this activity in Activities Billing and pre-filters Invoice History to it. */
  initialActivityId?: string | null;
  /** Deep-linked from a notification — scrolls to and highlights this invoice line in Invoice History. */
  initialInvoiceLineId?: string | null;
}

interface DrawerState {
  item: InvoiceItem;
  mode: "create" | "view" | "edit";
  existingLine?: InvoiceLine;
}

/**
 * The Invoice Management module — Commercial Summary (KPI cards) →
 * Invoice Summary → Activities Billing → Raise Invoice Drawer → Invoice
 * History. Invoice Summary always reflects the whole project, never just
 * whichever invoice the drawer has open — the drawer itself is an editor
 * only (Header Details, Billable Line Items, Save/Cancel) and never renders
 * a summary. A production feature: every change here persists onto
 * project.invoiceItems via setProject, unlike the earlier Quantity-Based
 * Invoice Tracking prototype (now fully removed) which only ever simulated
 * in memory.
 *
 * Invoice Cycles are always PROJECT-level, never activity-level — one cycle
 * (e.g. "Invoice 1") is shared by every activity billed under it. This page
 * owns the single `selectedProjectCycle` selection (below) that Invoice
 * Summary displays/refreshes against, that Raise Invoice writes new Lump Sum
 * lines into, and that Invoice History groups by. Commercial Milestone
 * Billing already worked this way natively (its own dropdown inside the
 * drawer lets Accounts join any existing cycle or start a new one); Lump Sum
 * previously (incorrectly) generated an independent cycle sequence per
 * activity, which this shared selection replaces.
 */
export function InvoiceDashboard({ project, setProject, readOnly = false, initialActivityId, initialInvoiceLineId }: Props) {
  const { showToast } = usePmoToast();
  const { user } = useAuth();
  const isReadOnly = readOnly || !setProject;
  // UI-courtesy layer only — the backend's requireApprovalPermission("Raise
  // Invoice") gate on POST /quantity/:quantityItemId/invoice-lines (and the
  // matching PATCH-transition check) remains the real, authoritative gate.
  const canRaiseInvoice = hasApprovalPermission(user, "Raise Invoice");
  // Invoice Edit/Delete approval rights (Oct 2026) — same UI-courtesy layer;
  // the backend's "Edit Invoice" content check (PATCH) and
  // requireApprovalPermission("Delete Invoice") (DELETE) are authoritative.
  const canEditInvoice = hasApprovalPermission(user, "Edit Invoice");
  const canDeleteInvoice = hasApprovalPermission(user, "Delete Invoice");

  const [drawerState, setDrawerState] = useState<DrawerState | null>(null);

  // Invoice Currency feature (Oct 2026) — duplicate-submission guard. True
  // while a persistProjectChange() sync is still talking to the backend. A
  // second save in that window would diff against optimistic lines whose
  // server ids don't exist yet (and could double-submit), so it is refused
  // with a message instead. A ref, not state: the guard must see the
  // current value synchronously, even for two clicks in the same frame.
  const isSyncingRef = useRef(false);

  // Request Invoice workflow — whether this project already has an Open
  // Invoice Request (duplicate-submission UX only; the backend's own
  // advisory-locked check is the real guard). Not fetched at all in a
  // read-only context, where the button never renders anyway.
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  // Also drives the Invoice Request lifecycle indicator below — per the
  // finalized business rule, that indicator shows "Invoice Requested" only
  // while a request is genuinely Open and shows nothing once it's
  // Completed/Cancelled, which is exactly this same value (no separate
  // "most recent request regardless of status" state needed any more).
  const [openInvoiceRequest, setOpenInvoiceRequest] = useState<InvoiceRequest | null>(null);
  const [sendInvoiceToTarget, setSendInvoiceToTarget] = useState<{ item: InvoiceItem; line: InvoiceLine } | null>(null);

  // Extracted so it can be called both on mount AND after a real invoice
  // mutation (see persistProjectChange below) — the lifecycle indicator must
  // reflect Raised/Partially Paid/Paid as soon as the user actually raises
  // or updates an invoice in this same session, not only after a remount.
  // Still the one existing endpoint, never a new one.
  const refreshInvoiceRequestState = () => {
    if (isReadOnly) return;
    getInvoiceRequestsForProject(project.id)
      .then((requests) => {
        setOpenInvoiceRequest(requests.find((r) => r.status === "Open") ?? null);
      })
      .catch(() => {
        // Best-effort UX only — a failed load never blocks Request Invoice
        // itself (the backend's own duplicate guard still applies at submit
        // time), so this is silently ignored rather than surfaced as an error.
      });
  };

  useEffect(() => {
    refreshInvoiceRequestState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, isReadOnly]);

  // The unified, project-wide "Raise Invoice" flow: ONE common button (in
  // ActivitiesTable's header) opens the Invoice Cycle picker; choosing a
  // cycle there opens the Invoice Workspace, which lists every activity in
  // one Excel-style table. This replaces the old per-activity trigger —
  // RaiseInvoiceDrawer below is now used only for viewing/editing a single
  // already-saved invoice line from Invoice History.
  const [isCycleModalOpen, setIsCycleModalOpen] = useState(false);
  const [workspaceInvoiceNo, setWorkspaceInvoiceNo] = useState<string | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printInvoiceNo, setPrintInvoiceNo] = useState<string | null>(null);

  // The PROJECT-level Invoice Cycle currently selected on this page — the
  // single source of truth Lump Sum's Raise Invoice, Invoice Summary, and
  // (via the project-wide invoiceNo it resolves to) Invoice History all
  // share. Every activity billed while a given cycle is selected here
  // participates in that SAME cycle; Lump Sum no longer computes its own
  // per-activity cycle sequence. Defaults to the most recently used real
  // cycle, or the next fresh number if this project has never raised a
  // Lump Sum invoice yet. Declared unconditionally (before the Invoice
  // Method early-return below) because it's a hook — its value is simply
  // unused for Invoice Line Items / Commercial Milestone Billing projects.
  const [selectedProjectCycle, setSelectedProjectCycle] = useState<string>(() => {
    const cycles = getInvoiceCyclesForProject(project).filter((cycle) => !cycle.isNew);
    return cycles.length > 0 ? cycles[cycles.length - 1].invoiceNo : NEW_INVOICE_CYCLE;
  });

  // No Invoice Method chosen yet (Invoice Management header dropdown) — no
  // billing workflow, summary, or history is shown until Accounts explicitly
  // picks Lump Sum or Invoice Line Items. See getInvoiceMethod().
  const invoiceMethod = getInvoiceMethod(project);
  if (!invoiceMethod) {
    return (
      <Card padded={false}>
        <CardBody>
          <EmptyState
            icon={<ListChecks size={22} />}
            title="Select an Invoice Method"
            description="Choose Lump Sum or Invoice Line Items above to start raising invoices for this project."
          />
        </CardBody>
      </Card>
    );
  }

  const isLumpSum = invoiceMethod === "lump_sum";
  const isMlmp = invoiceMethod === "mlmp";
  const isAmountBased = invoiceMethod === "amount_based";

  // "+ Create New Invoice Cycle" — Lump Sum, MLMP, and Amount Based only,
  // all of which share a single project-level cycle. Advances the shared
  // selection to the next never-used project-wide number; it only becomes a
  // real, persisted cycle once an invoice is actually saved against it.
  const handleCreateNewProjectCycle = () => {
    setSelectedProjectCycle(NEW_INVOICE_CYCLE);
  };

  const handleRaiseInvoice = () => {
    if (isReadOnly) return;
    // UI-courtesy layer only (the backend's requireApprovalPermission("Raise
    // Invoice") gate is the real, authoritative check) — but it must give
    // clear, visible feedback rather than silently doing nothing. The button
    // itself is never disabled via the native `disabled` attribute (that
    // blocks onClick entirely, so a user without permission got zero
    // feedback on click — see ActivitiesTable.tsx's own comment), so this is
    // the one place that actually stops the flow and explains why.
    if (!canRaiseInvoice) {
      showToast({
        type: "error",
        message: "You cannot raise invoices — You do not have the Raise Invoice permission please contact administrator or use Request Invoice instead.",
        duration: 0,
      });
      return;
    }
    setIsCycleModalOpen(true);
  };

  const handleCycleContinue = (invoiceNo: string) => {
    setIsCycleModalOpen(false);
    setWorkspaceInvoiceNo(invoiceNo);
  };

  const handleWorkspaceSave = (updatedProject: Project) => {
    if (!persistProjectChange(updatedProject)) return;
    setWorkspaceInvoiceNo(null);
    // Manual invoice numbering — if the summary was showing the "new
    // invoice" placeholder, point it at the invoice just created (its number
    // is the one cycle that exists now but did not before).
    if (selectedProjectCycle === NEW_INVOICE_CYCLE) {
      const before = new Set(getInvoiceCyclesForProject(project).map((cycle) => cycle.invoiceNo));
      const created = getInvoiceCyclesForProject(updatedProject).find((cycle) => !cycle.isNew && !before.has(cycle.invoiceNo));
      if (created) setSelectedProjectCycle(created.invoiceNo);
    }
  };

  const handleViewInvoiceLine = (item: InvoiceItem, line: InvoiceLine) => {
    setDrawerState({ item, mode: "view", existingLine: line });
  };

  const handleEditInvoiceLine = (item: InvoiceItem, line: InvoiceLine) => {
    if (isReadOnly) return;
    setDrawerState({ item, mode: "edit", existingLine: line });
  };

  // Invoice actions (Raise/Edit/Delete) must never depend on the user
  // separately remembering to click "Update Project" at the bottom of the
  // whole Edit Project form afterwards — that button only exists for the
  // General/Quantity/Payments/etc. tabs. setProject alone only updates this
  // page's in-memory React state; without also persisting here, a raised
  // invoice looks saved (Invoice History shows it, KPIs update) but is
  // silently lost the moment the page remounts (navigate away and back,
  // refresh) — reopening Raise Invoice for that activity would then
  // correctly, but confusingly, show no invoices at all. updateProject
  // writes straight to the same localStorage record FormButtons' "Update
  // Project" writes to, so an invoice raised/edited/deleted here is durable
  // immediately, exactly like clicking Save Invoice implies.
  //
  // The backend is now the real source of truth (Invoice Backend Phase) —
  // every one of the 5 callers below (drawer save, all 4 workspace modals,
  // delete, status change) still builds its own `updatedProject` exactly as
  // before; this is the ONE place that also reconciles with the API, so
  // none of that existing UI/business logic needed to change. The
  // localStorage write happens first (optimistic — same immediate UX as
  // before there was a backend at all), then syncInvoiceLinesWithApi()
  // diffs old vs. new InvoiceLines by id (POST new, PATCH changed, DELETE
  // removed) and the backend's authoritative response — real ids for
  // anything just created, current server-derived calculatedAmountINR/
  // commercialAdjustmentINR — replaces the optimistic guess. If the backend
  // call fails, the optimistic localStorage write still stands (same
  // degraded behavior as before this phase existed) and the error is
  // surfaced to the console rather than silently swallowed.
  // Invoice Currency feature (Oct 2026) — the server's current lock for this
  // project, or the value we already had if it can't be read (older backend
  // or a transient failure). Never invents a lock.
  const readServerInvoiceCurrency = async (fallback: Project["invoiceCurrency"]): Promise<Project["invoiceCurrency"]> => {
    try {
      const fresh = await fetchProjectInvoiceCurrency(project.id);
      return fresh === undefined ? fallback : fresh;
    } catch {
      return fallback;
    }
  };

  const persistProjectChange = (updatedProject: Project): boolean => {
    if (isSyncingRef.current) {
      showToast({
        type: "error",
        title: "Previous invoice change still saving",
        message: "Please wait a moment for the previous invoice change to finish saving, then try again.",
      });
      return false;
    }
    isSyncingRef.current = true;

    setProject?.(updatedProject);
    updateProject({ ...updatedProject, updatedAt: new Date().toISOString() });

    syncInvoiceLinesWithApi(project.id, project.invoiceItems, updatedProject.invoiceItems)
      .then(async (reconciledItems) => {
        // Re-read the lock too: a first raise establishes it and a delete may
        // release it, so the copy loaded with the project is stale now. A
        // new invoice opened next then starts from the server's real state.
        const invoiceCurrency = await readServerInvoiceCurrency(updatedProject.invoiceCurrency);
        const reconciledProject = { ...updatedProject, invoiceItems: reconciledItems, invoiceCurrency };
        setProject?.(reconciledProject);
        updateProject({ ...reconciledProject, updatedAt: new Date().toISOString() });
        // Invoice Request lifecycle indicator — re-check after a real,
        // backend-confirmed invoice change (Raise/status update/edit/delete
        // all funnel through here) so Open -> Completed (and the fulfilled
        // line's own status) is reflected without requiring a remount. The
        // backend's own Raised-fulfillment/Paid-notification work is itself
        // fire-and-forget server-side, so this can very occasionally still
        // be a beat behind — never incorrect, just eventually consistent,
        // same class of tradeoff as every other fire-and-forget path here.
        refreshInvoiceRequestState();
      })
      .catch((error) => {
        console.error("Failed to sync invoice changes with the backend:", error);
        // Invoice Currency feature (Oct 2026) — a 4xx is the backend
        // definitively rejecting the change (e.g. currency lock, invalid
        // exchange rate, Work Order Value ceiling): show its actual reason,
        // and replace the optimistic local state with what the server really
        // holds, so the screen never shows an invoice that was never saved.
        // Network/5xx failures keep the previous behavior (outcome unknown).
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          showToast({
            type: "error",
            title: "Invoice change was rejected",
            message: error.message,
            duration: 0,
          });
          return Promise.all([fetchInvoiceItemsFromApi(project.id), readServerInvoiceCurrency(updatedProject.invoiceCurrency)])
            .then(([serverItems, invoiceCurrency]) => {
              const serverProject = { ...updatedProject, invoiceItems: serverItems, invoiceCurrency };
              setProject?.(serverProject);
              updateProject({ ...serverProject, updatedAt: new Date().toISOString() });
            })
            .catch((reloadError) => {
              console.error("Failed to reload invoices after a rejected change:", reloadError);
            });
        }
        showToast({
          type: "error",
          title: "Invoice change not saved to the server",
          message: "Your change is showing locally, but saving it to the server failed. Please retry, or it may not persist.",
          duration: 0,
        });
      })
      .finally(() => {
        isSyncingRef.current = false;
      });
    return true;
  };

  const handleDeleteInvoiceLine = (item: InvoiceItem, line: InvoiceLine) => {
    if (isReadOnly || !setProject) return;

    const updatedItems = project.invoiceItems.map((invoiceItem) =>
      invoiceItem.id !== item.id
        ? invoiceItem
        : { ...invoiceItem, invoices: invoiceItem.invoices.filter((existing) => existing.id !== line.id) }
    );
    const updatedProject = { ...project, invoiceItems: updatedItems };
    if (!persistProjectChange(updatedProject)) return;

    // Audit Log "Invoice Deleted"
    logInvoiceDeletedAudit(
      project.id,
      line.invoiceNo,
      line.invoiceAmountINR,
      "User deleted invoice line from Invoice History"
    );
  };

  const handleUpdateInvoiceCycleStatus = (invoiceNo: string, newStatus: InvoiceLineStatus) => {
    if (isReadOnly || !setProject) return;

    let oldStatus = "Draft";
    const updatedItems = (project.invoiceItems ?? []).map((item) => {
      const updatedLines = (item.invoices ?? []).map((line) => {
        if (line.invoiceNo === invoiceNo) {
          oldStatus = line.status;
          return { ...line, status: newStatus };
        }
        return line;
      });
      return { ...item, invoices: updatedLines };
    });

    const updatedProject = { ...project, invoiceItems: updatedItems };
    if (!persistProjectChange(updatedProject)) return;

    // Audit Log "Invoice Status Updated"
    logInvoiceCycleStatusChangedAudit(project.id, invoiceNo, oldStatus, newStatus);
  };

  const handleSave = (updatedProject: Project) => {
    if (!persistProjectChange(updatedProject)) return;
    setDrawerState(null);
  };

  // Shared by InvoiceSummaryPanel's "Print Invoice Document" button and
  // InvoiceHistory's per-row Print action — the ONE way to open the
  // isolated-iframe print pipeline (PrintInvoiceModal / printComponentElement).
  // Never call window.print() directly from anywhere in this module.
  const handlePrintInvoice = (invoiceNo: string) => {
    setPrintInvoiceNo(invoiceNo);
    setIsPrintModalOpen(true);
  };

  // The drawer must never operate on the snapshot captured at click time —
  // re-resolve `item`/`existingLine` against the live `project` prop on
  // every render so the dialog reflects the same, single source of truth
  // as the rest of the module (Activities table, Invoice History, KPI
  // cards) rather than a frozen independent copy.
  const activeItem = drawerState
    ? project.invoiceItems.find((invoiceItem) => invoiceItem.id === drawerState.item.id) ?? drawerState.item
    : null;
  const activeExistingLine = drawerState?.existingLine
    ? activeItem?.invoices.find((line) => line.id === drawerState.existingLine!.id) ?? drawerState.existingLine
    : drawerState?.existingLine;

  return (
    <div className="space-y-5">
      <CommercialSummary project={project} />

      <ActivitiesTable
        project={project}
        readOnly={isReadOnly}
        onRaiseInvoice={handleRaiseInvoice}
        canRaiseInvoice={canRaiseInvoice}
        onRequestInvoice={isReadOnly ? undefined : () => setIsRequestModalOpen(true)}
        hasOpenInvoiceRequest={!!openInvoiceRequest}
        highlightItemId={initialActivityId}
      />

      {isCycleModalOpen && (
        <RaiseInvoiceCycleModal
          project={project}
          onClose={() => setIsCycleModalOpen(false)}
          onContinue={handleCycleContinue}
        />
      )}

      {/* Lump Sum bills against Payment Milestones (checklist, no quantity at
          all); MLMP bills against per-activity SET milestones; Invoice Line
          Items keeps its existing quantity/activity table completely
          unchanged. Which modal renders is decided purely by Invoice Method
          — never a UI redesign of any of the other workspaces. */}
      {workspaceInvoiceNo && isLumpSum && (
        <LumpSumInvoiceWorkspaceModal
          key={workspaceInvoiceNo}
          project={project}
          invoiceNo={workspaceInvoiceNo}
          onClose={() => setWorkspaceInvoiceNo(null)}
          onSave={handleWorkspaceSave}
        />
      )}

      {workspaceInvoiceNo && isMlmp && (
        <MlmpInvoiceWorkspaceModal
          key={workspaceInvoiceNo}
          project={project}
          invoiceNo={workspaceInvoiceNo}
          onClose={() => setWorkspaceInvoiceNo(null)}
          onSave={handleWorkspaceSave}
        />
      )}

      {workspaceInvoiceNo && isAmountBased && (
        <AmountBasedInvoiceWorkspaceModal
          key={workspaceInvoiceNo}
          project={project}
          invoiceNo={workspaceInvoiceNo}
          onClose={() => setWorkspaceInvoiceNo(null)}
          onSave={handleWorkspaceSave}
        />
      )}

      {workspaceInvoiceNo && !isLumpSum && !isMlmp && !isAmountBased && (
        <InvoiceWorkspaceModal
          key={workspaceInvoiceNo}
          project={project}
          invoiceNo={workspaceInvoiceNo}
          onClose={() => setWorkspaceInvoiceNo(null)}
          onSave={handleWorkspaceSave}
        />
      )}

      {/* Invoice Request lifecycle indicator — persistent status, never an
          action control (see InvoiceRequestStatusIndicator.tsx's own
          comment). Renders nothing until a Request Invoice has actually
          been submitted for this project. */}
      {openInvoiceRequest && (
        <div className="flex items-center gap-2 px-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">
            Invoice Request
          </span>
          <InvoiceRequestStatusIndicator invoiceRequest={openInvoiceRequest} />
        </div>
      )}

      {/* Side-by-Side: Compact Invoice Summary (35%) + Invoice History (65%) with matching heights */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div className="lg:col-span-4 xl:col-span-4 flex flex-col">
          <InvoiceSummaryPanel
            project={project}
            isProjectLevelCycle={isLumpSum || isMlmp || isAmountBased}
            selectedCycle={selectedProjectCycle}
            onSelectCycle={setSelectedProjectCycle}
            onCreateNewCycle={handleCreateNewProjectCycle}
            onPrintInvoice={handlePrintInvoice}
          />
        </div>
        <div className="lg:col-span-8 xl:col-span-8 flex flex-col overflow-hidden min-w-0">
          <InvoiceHistory
            project={project}
            onView={handleViewInvoiceLine}
            onEdit={isReadOnly || !canEditInvoice ? undefined : handleEditInvoiceLine}
            onDelete={isReadOnly || !canDeleteInvoice ? undefined : handleDeleteInvoiceLine}
            onUpdateInvoiceStatus={isReadOnly ? undefined : handleUpdateInvoiceCycleStatus}
            onPrintInvoice={handlePrintInvoice}
            onSendInvoiceTo={isReadOnly ? undefined : (item, line) => setSendInvoiceToTarget({ item, line })}
            initialActivityFilter={initialActivityId}
            highlightLineId={initialInvoiceLineId}
          />
        </div>
      </div>

      {isRequestModalOpen && (
        <RequestInvoiceModal
          project={project}
          onClose={() => setIsRequestModalOpen(false)}
          onSubmitted={(created) => {
            // The POST response already IS the just-created Open request —
            // no follow-up GET needed to know "is one now pending" (removed
            // per independent review; this used to re-fetch the full list
            // just to derive the same boolean the response already gave us).
            setIsRequestModalOpen(false);
            setOpenInvoiceRequest(created);
          }}
        />
      )}

      {sendInvoiceToTarget && (
        <SendInvoiceToModal
          item={sendInvoiceToTarget.item}
          line={sendInvoiceToTarget.line}
          onClose={() => setSendInvoiceToTarget(null)}
        />
      )}

      {/* Print Invoice Document Modal */}
      {isPrintModalOpen && (
        <PrintInvoiceModal
          project={project}
          setProject={setProject}
          initialInvoiceNo={printInvoiceNo}
          onClose={() => setIsPrintModalOpen(false)}
        />
      )}

      {/* create/edit are only ever triggered when not read-only (handlers guard above); view is safe either way. */}
      {drawerState && activeItem && (
        <RaiseInvoiceDrawer
          // Forces a full unmount/remount — never a prop update on a reused
          // instance — whenever the target activity, mode, or invoice line
          // changes. Without this, React's reconciler is free to treat two
          // consecutive opens (e.g. Raise Invoice for Activity A, then
          // Activity B) as the SAME component instance just receiving new
          // props, which would let useState's lazy initializers keep
          // whatever they first initialized to instead of recomputing for
          // the new activity. Keying on identity makes "every open starts
          // from a completely fresh, correctly-scoped dialog" a structural
          // guarantee rather than something every piece of internal state
          // has to get right on its own.
          key={`${activeItem.id}:${drawerState.mode}:${activeExistingLine?.id ?? "new"}`}
          project={project}
          item={activeItem}
          mode={drawerState.mode}
          existingLine={activeExistingLine}
          projectInvoiceCycle={selectedProjectCycle}
          onClose={() => setDrawerState(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
