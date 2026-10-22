import { useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Project } from "../../../../types/Project";
import type { InvoiceItem, InvoiceLine, InvoiceLineStatus } from "../../../../types/InvoiceItem";
import { useAuth } from "../../../../auth/authContext";
import { hasApprovalPermission } from "../../../../auth/permissions";
import { usePmoToast } from "../../../../components/ui/usePmoToast";
import { logInvoiceCycleStatusChangedAudit, logInvoiceDeletedAudit } from "../../../../services/projectAuditService";
import {
  persistInvoiceProjectChange,
  realPersistDeps,
  removeInvoiceLine,
  resolveActiveDrawer,
  setInvoiceCycleStatus,
  type DrawerState,
} from "./invoiceLineActions";

export interface UseInvoiceLineActionsOptions {
  project: Project;
  /** Omit to mount in a read-only context — e.g. View Project's Invoices tab. */
  setProject?: Dispatch<SetStateAction<Project>> | undefined;
  readOnly?: boolean | undefined;
  /** Runs when a save has begun talking to the server (Invoice Tracker shows "saving"). */
  onSaving?: (() => void) | undefined;
  /** Runs after a save reaches the server (the dashboard refreshes its invoice-request indicator). */
  onSynced?: (() => void) | undefined;
  /** Runs when a save has finished, successfully or not (Invoice Tracker reloads its list). */
  onSettled?: (() => void) | undefined;
  /** Open the drawer straight away (Invoice Tracker mounts this hook per action, already knowing which line). */
  initialDrawer?: DrawerState | null | undefined;
}

/**
 * View / Edit / Delete / invoice-status actions on a project's invoice lines (Invoice Tracker, Oct 2026 — extracted
 * from InvoiceDashboard, behaviour unchanged). Shared by Edit Project → Invoices and Invoice Tracker, so there is one
 * editor, one save path and one set of rules. The UI-courtesy permission flags mirror the backend's authoritative
 * "Edit Invoice" content check (PATCH) and requireApprovalPermission("Delete Invoice") (DELETE).
 */
export function useInvoiceLineActions({ project, setProject, readOnly = false, onSaving, onSynced, onSettled, initialDrawer = null }: UseInvoiceLineActionsOptions) {
  const { showToast } = usePmoToast();
  const { user } = useAuth();
  const isReadOnly = readOnly || !setProject;
  const canEditInvoice = hasApprovalPermission(user, "Edit Invoice");
  const canDeleteInvoice = hasApprovalPermission(user, "Delete Invoice");

  const [drawerState, setDrawerState] = useState<DrawerState | null>(initialDrawer);

  // Invoice Currency feature (Oct 2026) — duplicate-submission guard, true while a sync is still talking to the backend.
  const syncingRef = useRef(false);

  const persistProjectChange = (updatedProject: Project): boolean =>
    persistInvoiceProjectChange({ project, updatedProject, setProject, syncing: syncingRef, onStart: onSaving, onSynced, onSettled, deps: realPersistDeps(showToast) });

  const openView = (item: InvoiceItem, line: InvoiceLine) => {
    setDrawerState({ item, mode: "view", existingLine: line });
  };

  const openEdit = (item: InvoiceItem, line: InvoiceLine) => {
    if (isReadOnly) return;
    setDrawerState({ item, mode: "edit", existingLine: line });
  };

  const deleteInvoiceLine = (item: InvoiceItem, line: InvoiceLine) => {
    if (isReadOnly || !setProject) return;
    if (!persistProjectChange(removeInvoiceLine(project, item, line))) return;

    // Audit Log "Invoice Deleted"
    logInvoiceDeletedAudit(project.id, line.invoiceNo, line.invoiceAmountINR, "User deleted invoice line from Invoice History");
  };

  const updateInvoiceCycleStatus = (invoiceNo: string, newStatus: InvoiceLineStatus) => {
    if (isReadOnly || !setProject) return;
    const { updatedProject, oldStatus } = setInvoiceCycleStatus(project, invoiceNo, newStatus);
    if (!persistProjectChange(updatedProject)) return;

    // Audit Log "Invoice Status Updated"
    logInvoiceCycleStatusChangedAudit(project.id, invoiceNo, oldStatus, newStatus);
  };

  const saveFromDrawer = (updatedProject: Project) => {
    if (!persistProjectChange(updatedProject)) return;
    setDrawerState(null);
  };

  return {
    isReadOnly,
    canEditInvoice,
    canDeleteInvoice,
    drawerState,
    activeDrawer: resolveActiveDrawer(project, drawerState),
    closeDrawer: () => setDrawerState(null),
    openView,
    openEdit,
    deleteInvoiceLine,
    updateInvoiceCycleStatus,
    saveFromDrawer,
    persistProjectChange,
  };
}

export type InvoiceLineActions = ReturnType<typeof useInvoiceLineActions>;
