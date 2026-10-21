import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ListChecks } from "lucide-react";

import type { Project } from "../../../../types/Project";
import type { InvoiceItem, InvoiceLine } from "../../../../types/InvoiceItem";
import type { InvoiceRequest } from "../../../../types/InvoiceRequest";
import { getInvoiceRequestsForProject } from "../../../../services/invoiceRequestService";
import { useAuth } from "../../../../auth/authContext";
import { hasApprovalPermission } from "../../../../auth/permissions";

import { CommercialSummary } from "./CommercialSummary";
import { InvoiceSummaryPanel } from "./InvoiceSummaryPanel";
import { ActivitiesTable } from "./ActivitiesTable";
import { useInvoiceLineActions } from "./useInvoiceLineActions";
import { InvoiceActionDrawer } from "./InvoiceActionDrawer";
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
  // View / Edit / Delete / status-change and the save-to-server path are shared with Invoice Tracker (invoiceLineActions.ts).
  const actions = useInvoiceLineActions({ project, setProject, readOnly, onSynced: () => refreshInvoiceRequestState() });
  const { isReadOnly, canEditInvoice, canDeleteInvoice, persistProjectChange } = actions;
  // UI-courtesy layer only — the backend's requireApprovalPermission("Raise
  // Invoice") gate on POST /quantity/:quantityItemId/invoice-lines (and the
  // matching PATCH-transition check) remains the real, authoritative gate.
  const canRaiseInvoice = hasApprovalPermission(user, "Raise Invoice");
  // Invoice Edit/Delete approval rights (Oct 2026) — same UI-courtesy layer;
  // the backend's "Edit Invoice" content check (PATCH) and
  // requireApprovalPermission("Delete Invoice") (DELETE) are authoritative.

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

  const handleViewInvoiceLine = actions.openView;
  const handleEditInvoiceLine = actions.openEdit;

  // persistProjectChange (the optimistic write + server sync, duplicate-submission guard and error handling) now lives in
  // invoiceLineActions.ts, shared with Invoice Tracker — see persistInvoiceProjectChange().
  const handleDeleteInvoiceLine = actions.deleteInvoiceLine;
  const handleUpdateInvoiceCycleStatus = actions.updateInvoiceCycleStatus;

  // Shared by InvoiceSummaryPanel's "Print Invoice Document" button and
  // InvoiceHistory's per-row Print action — the ONE way to open the
  // isolated-iframe print pipeline (PrintInvoiceModal / printComponentElement).
  // Never call window.print() directly from anywhere in this module.
  const handlePrintInvoice = (invoiceNo: string) => {
    setPrintInvoiceNo(invoiceNo);
    setIsPrintModalOpen(true);
  };

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
      <InvoiceActionDrawer project={project} actions={actions} projectInvoiceCycle={selectedProjectCycle} />
    </div>
  );
}
