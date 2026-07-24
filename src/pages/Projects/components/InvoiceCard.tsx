import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { History, Plus, Receipt } from "lucide-react";

import type { Project } from "../../../types/Project";
import { Button } from "../../../components/ui/Button";

import InvoiceSummaryCards from "./Invoice/InvoiceSummaryCards";
import InvoiceProgressTable from "./Invoice/InvoiceProgressTable";
import BillingProgressDrawer from "./Invoice/BillingProgressDrawer";
import BillingHistoryModal from "./Invoice/BillingHistoryModal";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
}

const InvoiceCard = ({ project, setProject }: Props) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Drawer View/Edit state
  const [drawerMode, setDrawerMode] = useState<"create" | "view" | "edit">("create");
  const [selectedItemId, setSelectedItemId] = useState<string | undefined>(undefined);
  const [selectedEntryId, setSelectedEntryId] = useState<string | undefined>(undefined);
  const [selectedMilestoneBillingId, setSelectedMilestoneBillingId] = useState<string | undefined>(undefined);

  // Forces BillingProgressDrawer to fully remount (resetting its internal
  // input state) whenever it's asked to show a different record, even if a
  // drawer instance already happened to be mounted. Without this, reopening
  // it for a different entry while one is already open would reuse stale
  // useState initializers instead of reflecting the newly selected record.
  const drawerKey = `${drawerMode}-${selectedEntryId ?? selectedMilestoneBillingId ?? selectedItemId ?? "new"}`;

  const handleSaveBillingProgress = (updatedProject: Project) => {
    setProject(updatedProject);
    setIsDrawerOpen(false);
  };

  const handleDeleteQuantityEntry = (itemId: string, invoiceId: string) => {
    setProject((prev) => ({
      ...prev,
      invoiceItems: prev.invoiceItems.map((item) =>
        item.id === itemId
          ? { ...item, invoices: item.invoices.filter((entry) => entry.id !== invoiceId) }
          : item
      ),
    }));
  };

  const handleDeleteMilestoneBilling = (billingId: string) => {
    setProject((prev) => ({
      ...prev,
      milestoneBillings: (prev.milestoneBillings ?? []).filter(
        (billing) => billing.id !== billingId
      ),
    }));
  };

  const handleOpenCreateDrawer = () => {
    setDrawerMode("create");
    setSelectedItemId(undefined);
    setSelectedEntryId(undefined);
    setSelectedMilestoneBillingId(undefined);
    setIsDrawerOpen(true);
  };

  const handleViewQuantityEntry = (itemId: string, entryId: string) => {
    setIsHistoryOpen(false);
    setDrawerMode("view");
    setSelectedItemId(itemId);
    setSelectedEntryId(entryId);
    setSelectedMilestoneBillingId(undefined);
    setIsDrawerOpen(true);
  };

  const handleEditQuantityEntry = (itemId: string, entryId: string) => {
    setIsHistoryOpen(false);
    setDrawerMode("edit");
    setSelectedItemId(itemId);
    setSelectedEntryId(entryId);
    setSelectedMilestoneBillingId(undefined);
    setIsDrawerOpen(true);
  };

  const handleViewMilestoneBilling = (billingId: string) => {
    setIsHistoryOpen(false);
    setDrawerMode("view");
    setSelectedItemId(undefined);
    setSelectedEntryId(undefined);
    setSelectedMilestoneBillingId(billingId);
    setIsDrawerOpen(true);
  };

  const handleEditMilestoneBilling = (billingId: string) => {
    setIsHistoryOpen(false);
    setDrawerMode("edit");
    setSelectedItemId(undefined);
    setSelectedEntryId(undefined);
    setSelectedMilestoneBillingId(billingId);
    setIsDrawerOpen(true);
  };

  return (
    <>
      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-[var(--nu-shadow-sm)] overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5 border-b">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-11 w-11 shrink-0 rounded-xl bg-blue-100 flex items-center justify-center">
              <Receipt className="text-blue-600" size={22} />
            </div>

            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-800">
                Invoice Progress Tracker
              </h2>

              <p className="text-sm text-gray-500">
                Work packages mirror Quantity Details activities automatically.
                Track invoices raised against each and monitor collection
                progress.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="secondary"
              onClick={() => {
                setIsDrawerOpen(false);
                setIsHistoryOpen(true);
              }}
              className="gap-2 px-4 py-2"
            >
              <History size={16} />
              Billing History
            </Button>

            <Button variant="primary" onClick={handleOpenCreateDrawer} icon={<Plus size={16} />}>
              Update Billing Progress
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          <InvoiceSummaryCards project={project} />

          <InvoiceProgressTable project={project} />
        </div>
      </div>

      {isDrawerOpen && (
        <BillingProgressDrawer
          key={drawerKey}
          project={project}
          mode={drawerMode}
          initialItemId={selectedItemId}
          initialInvoiceId={selectedEntryId}
          initialMilestoneBillingId={selectedMilestoneBillingId}
          onClose={() => setIsDrawerOpen(false)}
          onSave={handleSaveBillingProgress}
        />
      )}

      {isHistoryOpen && (
        <BillingHistoryModal
          project={project}
          onClose={() => setIsHistoryOpen(false)}
          onDeleteQuantityEntry={handleDeleteQuantityEntry}
          onDeleteMilestoneBilling={handleDeleteMilestoneBilling}
          onViewQuantityEntry={handleViewQuantityEntry}
          onEditQuantityEntry={handleEditQuantityEntry}
          onViewMilestoneBilling={handleViewMilestoneBilling}
          onEditMilestoneBilling={handleEditMilestoneBilling}
        />
      )}
    </>
  );
};

export default InvoiceCard;
