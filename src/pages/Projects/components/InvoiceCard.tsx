import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Receipt } from "lucide-react";

import type { Project } from "../../../types/Project";
import type { InvoiceEntry } from "../../../types/InvoiceItem";

import InvoiceSummaryCards from "./Invoice/InvoiceSummaryCards";
import InvoiceProgressTable from "./Invoice/InvoiceProgressTable";
import BillingProgressDrawer from "./Invoice/BillingProgressDrawer";
import InvoiceHistoryModal from "./Invoice/InvoiceHistoryModal";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
}

const InvoiceCard = ({ project, setProject }: Props) => {
  const [drawerItemId, setDrawerItemId] = useState<string | null>(null);

  const [historyItemId, setHistoryItemId] = useState<string | null>(null);

  const historyItem =
    project.invoiceItems.find((item) => item.id === historyItemId) ?? null;

  const drawerItem =
    project.invoiceItems.find((item) => item.id === drawerItemId) ?? null;

  const handleRaiseInvoice = (itemId: string) => {
    setDrawerItemId(itemId);
  };

  const handleViewHistory = (itemId: string) => {
    setHistoryItemId(itemId);
  };

  const handleAddInvoiceFromHistory = () => {
    if (!historyItem) return;

    setHistoryItemId(null);
    setDrawerItemId(historyItem.id);
  };

  const handleDeleteInvoice = (invoiceId: string) => {
    if (!historyItemId) return;

    setProject((prev) => ({
      ...prev,
      invoiceItems: prev.invoiceItems.map((item) =>
        item.id === historyItemId
          ? {
              ...item,
              invoices: item.invoices.filter(
                (entry) => entry.id !== invoiceId
              ),
            }
          : item
      ),
    }));
  };

  const handleCloseDrawer = () => {
    setDrawerItemId(null);
  };

  const handleSaveInvoice = (invoice: InvoiceEntry) => {
    if (!drawerItemId) return;

    setProject((prev) => ({
      ...prev,
      invoiceItems: prev.invoiceItems.map((item) =>
        item.id === drawerItemId
          ? { ...item, invoices: [...item.invoices, invoice] }
          : item
      ),
    }));

    setDrawerItemId(null);
  };

  return (
    <>
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">

        {/* Header */}

        <div className="flex items-center justify-between px-6 py-5 border-b">

          <div className="flex items-center gap-3">

            <div className="h-11 w-11 rounded-xl bg-blue-100 flex items-center justify-center">
              <Receipt className="text-blue-600" size={22} />
            </div>

            <div>
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

        </div>

        {/* Body */}

        <div className="p-6 space-y-6">

          <InvoiceSummaryCards project={project} />

          <InvoiceProgressTable
            items={project.invoiceItems}
            readOnly={false}
            onRaiseInvoice={handleRaiseInvoice}
            onViewHistory={handleViewHistory}
          />

        </div>

      </div>

      {drawerItem && (
        <BillingProgressDrawer
          project={project}
          item={drawerItem}
          onClose={handleCloseDrawer}
          onSave={handleSaveInvoice}
        />
      )}

      {historyItem && (
        <InvoiceHistoryModal
          item={historyItem}
          onClose={() => setHistoryItemId(null)}
          onAddInvoice={handleAddInvoiceFromHistory}
          onDeleteInvoice={handleDeleteInvoice}
        />
      )}
    </>
  );
};

export default InvoiceCard;
