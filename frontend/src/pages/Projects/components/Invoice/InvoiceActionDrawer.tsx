import type { Project } from "../../../../types/Project";
import { RaiseInvoiceDrawer } from "./RaiseInvoiceDrawer";
import type { InvoiceLineActions } from "./useInvoiceLineActions";

/**
 * The existing View / Edit Invoice interface (RaiseInvoiceDrawer — Invoice Header Details + Billable Line Items),
 * rendered for whichever line the shared actions opened. `projectInvoiceCycle` is only used by the dashboard's Raise
 * flow; the drawer ignores it for View / Edit.
 */
export function InvoiceActionDrawer({ project, actions, projectInvoiceCycle }: { project: Project; actions: InvoiceLineActions; projectInvoiceCycle?: string }) {
  const { drawerState, activeDrawer } = actions;
  if (!drawerState || !activeDrawer) return null;
  return (
    <RaiseInvoiceDrawer
      // Forces a full unmount/remount — never a prop update on a reused instance — whenever the target activity,
      // mode, or invoice line changes, so every open starts from a completely fresh, correctly-scoped dialog.
      key={`${activeDrawer.item.id}:${drawerState.mode}:${activeDrawer.existingLine?.id ?? "new"}`}
      project={project}
      item={activeDrawer.item}
      mode={drawerState.mode}
      existingLine={activeDrawer.existingLine}
      {...(projectInvoiceCycle !== undefined && { projectInvoiceCycle })}
      onClose={actions.closeDrawer}
      onSave={actions.saveFromDrawer}
    />
  );
}
