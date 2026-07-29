import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { Project } from "../../../../types/Project";
import type { InvoiceItem, InvoiceLine } from "../../../../types/InvoiceItem";

import { CommercialSummary } from "./CommercialSummary";
import { ActivitiesTable } from "./ActivitiesTable";
import { RaiseInvoiceDrawer } from "./RaiseInvoiceDrawer";
import { InvoiceHistory } from "./InvoiceHistory";

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
      {drawerState && (
        <RaiseInvoiceDrawer
          project={project}
          item={drawerState.item}
          mode={drawerState.mode}
          existingLine={drawerState.existingLine}
          onClose={() => setDrawerState(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
