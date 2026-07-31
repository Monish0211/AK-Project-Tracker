import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ListChecks } from "lucide-react";

import type { Project } from "../../../../types/Project";
import type { InvoiceItem, InvoiceLine } from "../../../../types/InvoiceItem";

import { CommercialSummary } from "./CommercialSummary";
import { ActivitiesTable } from "./ActivitiesTable";
import { RaiseInvoiceDrawer } from "./RaiseInvoiceDrawer";
import { InvoiceHistory } from "./InvoiceHistory";
import { getInvoiceMethod } from "./InvoiceCalculations";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { Card, CardBody } from "../../../../components/ui/Card";

interface Props {
  project: Project;
  /** Omit to mount this in a read-only context — e.g. View Project's Invoices tab. */
  setProject?: Dispatch<SetStateAction<Project>>;
  readOnly?: boolean;
}

interface DrawerState {
  item: InvoiceItem;
  mode: "create" | "view" | "edit";
  existingLine?: InvoiceLine;
}

/**
 * The Invoice Management module — Commercial Summary → Activities Billing →
 * Raise Invoice Drawer → Invoice History. A production feature: every
 * change here persists onto project.invoiceItems via setProject, unlike the
 * earlier Quantity-Based Invoice Tracking prototype (now fully removed)
 * which only ever simulated in memory.
 */
export function InvoiceDashboard({ project, setProject, readOnly = false }: Props) {
  const isReadOnly = readOnly || !setProject;

  const [drawerState, setDrawerState] = useState<DrawerState | null>(null);

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

  const handleRaiseInvoice = (item: InvoiceItem) => {
    if (isReadOnly) return;
    setDrawerState({ item, mode: "create" });
  };

  const handleViewInvoiceLine = (item: InvoiceItem, line: InvoiceLine) => {
    setDrawerState({ item, mode: "view", existingLine: line });
  };

  const handleEditInvoiceLine = (item: InvoiceItem, line: InvoiceLine) => {
    if (isReadOnly) return;
    setDrawerState({ item, mode: "edit", existingLine: line });
  };

  const handleDeleteInvoiceLine = (item: InvoiceItem, line: InvoiceLine) => {
    if (isReadOnly || !setProject) return;
    setProject({
      ...project,
      invoiceItems: project.invoiceItems.map((invoiceItem) =>
        invoiceItem.id !== item.id
          ? invoiceItem
          : { ...invoiceItem, invoices: invoiceItem.invoices.filter((existing) => existing.id !== line.id) }
      ),
    });
  };

  const handleSave = (updatedProject: Project) => {
    setProject?.(updatedProject);
    setDrawerState(null);
  };

  // The drawer must never operate on the snapshot captured at click time —
  // re-resolve `item`/`existingLine` against the live `project` prop on
  // every render so the dialog reflects the same, single source of truth
  // as the rest of the module (Activities table, Milestone Summary, Invoice
  // History, KPI cards) rather than a frozen independent copy.
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
      />

      <InvoiceHistory
        project={project}
        onView={handleViewInvoiceLine}
        onEdit={isReadOnly ? undefined : handleEditInvoiceLine}
        onDelete={isReadOnly ? undefined : handleDeleteInvoiceLine}
      />

      {/* create/edit are only ever triggered when not read-only (handlers guard above); view is safe either way. */}
      {drawerState && activeItem && (
        <RaiseInvoiceDrawer
          project={project}
          item={activeItem}
          mode={drawerState.mode}
          existingLine={activeExistingLine}
          onClose={() => setDrawerState(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
