import type { Dispatch, SetStateAction } from "react";
import type { Project } from "../../../../types/Project";
import type { InvoiceItem, InvoiceLine, InvoiceLineStatus } from "../../../../types/InvoiceItem";
import { updateProject } from "../../../../services/projectService";
import { fetchInvoiceItemsFromApi, fetchProjectInvoiceCurrency, syncInvoiceLinesWithApi } from "../../../../services/invoiceService";
import { ApiError } from "../../../../services/apiClient";

/**
 * The invoice View / Edit / Delete / status-change logic that used to live inline in InvoiceDashboard.tsx, extracted
 * UNCHANGED (Oct 2026, Invoice Tracker) so Edit Project → Invoices and Invoice Tracker share exactly one
 * implementation — same save path, same overlap guard, same validation messages. Pure functions and one
 * dependency-injected persister, so the behaviour can be tested without a browser; useInvoiceLineActions.ts wraps
 * them for React.
 */

export interface DrawerState {
  item: InvoiceItem;
  mode: "create" | "view" | "edit";
  existingLine?: InvoiceLine;
}

/** The project with one invoice line removed (the Delete action's `updatedProject`). */
export function removeInvoiceLine(project: Project, item: InvoiceItem, line: InvoiceLine): Project {
  const updatedItems = project.invoiceItems.map((invoiceItem) =>
    invoiceItem.id !== item.id
      ? invoiceItem
      : { ...invoiceItem, invoices: invoiceItem.invoices.filter((existing) => existing.id !== line.id) }
  );
  return { ...project, invoiceItems: updatedItems };
}

/** Every line of one invoice number set to `newStatus` (the invoice-cycle status dropdown), plus the status it had. */
export function setInvoiceCycleStatus(project: Project, invoiceNo: string, newStatus: InvoiceLineStatus): { updatedProject: Project; oldStatus: string } {
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
  return { updatedProject: { ...project, invoiceItems: updatedItems }, oldStatus };
}

/**
 * The drawer must never operate on the snapshot captured at click time — re-resolve the item/line against the live
 * project on every render so the dialog reflects the same, single source of truth as the rest of the module.
 */
export function resolveActiveDrawer(project: Project, state: DrawerState | null): { item: InvoiceItem; existingLine: InvoiceLine | undefined } | null {
  if (!state) return null;
  const item = project.invoiceItems.find((invoiceItem) => invoiceItem.id === state.item.id) ?? state.item;
  const existingLine = state.existingLine
    ? item.invoices.find((line) => line.id === state.existingLine!.id) ?? state.existingLine
    : state.existingLine;
  return { item, existingLine };
}

export interface PersistToast {
  type: "error";
  title?: string;
  message: string;
  duration?: number;
}

/** Everything the persister touches outside itself — real services in the app, fakes in tests. */
export interface PersistDeps {
  updateProject: (project: Project) => void;
  syncInvoiceLinesWithApi: typeof syncInvoiceLinesWithApi;
  fetchInvoiceItemsFromApi: typeof fetchInvoiceItemsFromApi;
  fetchProjectInvoiceCurrency: typeof fetchProjectInvoiceCurrency;
  showToast: (toast: PersistToast) => void;
  now: () => string;
}

export const realPersistDeps = (showToast: (toast: PersistToast) => void): PersistDeps => ({
  updateProject,
  syncInvoiceLinesWithApi,
  fetchInvoiceItemsFromApi,
  fetchProjectInvoiceCurrency,
  showToast,
  now: () => new Date().toISOString(),
});

export interface PersistArgs {
  /** The project as it is now (the "previous" side of the sync diff). */
  project: Project;
  updatedProject: Project;
  setProject: Dispatch<SetStateAction<Project>> | undefined;
  /** Duplicate-submission guard: a ref, not state, so two clicks in the same frame still see the current value. */
  syncing: { current: boolean };
  /** Called after the server round trip succeeds (the dashboard refreshes its invoice-request state). */
  onSynced?: (() => void) | undefined;
  /** Called when the save has finished either way (Invoice Tracker refreshes its list from the server's truth). */
  onSettled?: (() => void) | undefined;
  deps: PersistDeps;
}

/**
 * Invoice Currency feature (Oct 2026) — the server's current lock for this project, or the value we already had if
 * it can't be read (older backend or a transient failure). Never invents a lock.
 */
async function readServerInvoiceCurrency(projectId: string, fallback: Project["invoiceCurrency"], deps: PersistDeps): Promise<Project["invoiceCurrency"]> {
  try {
    const fresh = await deps.fetchProjectInvoiceCurrency(projectId);
    return fresh === undefined ? fallback : fresh;
  } catch {
    return fallback;
  }
}

/**
 * Invoice actions (Raise/Edit/Delete) never depend on the user separately clicking "Update Project": the change is
 * written optimistically (React state + the same localStorage record), then syncInvoiceLinesWithApi() diffs old vs.
 * new lines by id (POST new, PATCH changed, DELETE removed) and the backend's authoritative response — real ids,
 * server-derived amounts — replaces the guess. A second save while one is still talking to the backend is refused
 * with a message (it would diff against optimistic lines whose server ids don't exist yet). Returns false when
 * refused. This is the single place invoice edits and deletes reach the existing PATCH / DELETE endpoints, and so
 * the single place every invoice status-history event originates from the UI.
 */
export function persistInvoiceProjectChange({ project, updatedProject, setProject, syncing, onSynced, onSettled, deps }: PersistArgs): boolean {
  if (syncing.current) {
    deps.showToast({
      type: "error",
      title: "Previous invoice change still saving",
      message: "Please wait a moment for the previous invoice change to finish saving, then try again.",
    });
    return false;
  }
  syncing.current = true;

  setProject?.(updatedProject);
  deps.updateProject({ ...updatedProject, updatedAt: deps.now() });

  deps
    .syncInvoiceLinesWithApi(project.id, project.invoiceItems, updatedProject.invoiceItems)
    .then(async (reconciledItems) => {
      const invoiceCurrency = await readServerInvoiceCurrency(project.id, updatedProject.invoiceCurrency, deps);
      const reconciledProject = { ...updatedProject, invoiceItems: reconciledItems, invoiceCurrency };
      setProject?.(reconciledProject);
      deps.updateProject({ ...reconciledProject, updatedAt: deps.now() });
      onSynced?.();
    })
    .catch((error) => {
      console.error("Failed to sync invoice changes with the backend:", error);
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        deps.showToast({
          type: "error",
          title: "Invoice change was rejected",
          message: error.message,
          duration: 0,
        });
        return Promise.all([deps.fetchInvoiceItemsFromApi(project.id), readServerInvoiceCurrency(project.id, updatedProject.invoiceCurrency, deps)])
          .then(([serverItems, invoiceCurrency]) => {
            const serverProject = { ...updatedProject, invoiceItems: serverItems, invoiceCurrency };
            setProject?.(serverProject);
            deps.updateProject({ ...serverProject, updatedAt: deps.now() });
          })
          .catch((reloadError) => {
            console.error("Failed to reload invoices after a rejected change:", reloadError);
          });
      }
      deps.showToast({
        type: "error",
        title: "Invoice change not saved to the server",
        message: "Your change is showing locally, but saving it to the server failed. Please retry, or it may not persist.",
        duration: 0,
      });
    })
    .finally(() => {
      syncing.current = false;
      onSettled?.();
    });
  return true;
}
