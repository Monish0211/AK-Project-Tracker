import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Plus, Receipt } from "lucide-react";

import type { Project } from "../../../types/Project";
import type { InvoiceEntry } from "../../../types/InvoiceItem";

import { calculateTotalPrice } from "../../../services/invoiceProgressService";

import InvoiceSummaryCards from "./Invoice/InvoiceSummaryCards";
import InvoiceProgressTable from "./Invoice/InvoiceProgressTable";
import RaiseInvoiceModal from "./Invoice/RaiseInvoiceModal";
import InvoiceHistoryModal from "./Invoice/InvoiceHistoryModal";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
}

interface RaiseModalState {
  itemId: string;
  invoice: InvoiceEntry | null;
}

const createEmptyInvoiceItem = () => ({
  id: crypto.randomUUID(),
  description: "",
  numberOfDays: 0,
  location: "",
  unitPrice: 0,
  totalPrice: 0,
  invoices: [],
});

const InvoiceCard = ({ project, setProject }: Props) => {
  const [raiseModalState, setRaiseModalState] =
    useState<RaiseModalState | null>(null);

  const [historyItemId, setHistoryItemId] = useState<string | null>(null);

  const historyItem =
    project.invoiceItems.find((item) => item.id === historyItemId) ?? null;

  const handleAddRow = () => {
    setProject((prev) => ({
      ...prev,
      invoiceItems: [...prev.invoiceItems, createEmptyInvoiceItem()],
    }));
  };

  const handleDeleteRow = (itemId: string) => {
    setProject((prev) => {
      if (prev.invoiceItems.length <= 1) {
        return prev;
      }

      return {
        ...prev,
        invoiceItems: prev.invoiceItems.filter((item) => item.id !== itemId),
      };
    });
  };

  const handleFieldChange = (
    itemId: string,
    field: "description" | "location",
    value: string
  ) => {
    setProject((prev) => ({
      ...prev,
      invoiceItems: prev.invoiceItems.map((item) =>
        item.id === itemId ? { ...item, [field]: value } : item
      ),
    }));
  };

  const handleNumericFieldChange = (
    itemId: string,
    field: "numberOfDays" | "unitPrice",
    value: number
  ) => {
    setProject((prev) => ({
      ...prev,
      invoiceItems: prev.invoiceItems.map((item) => {
        if (item.id !== itemId) {
          return item;
        }

        const updated = { ...item, [field]: value };

        return {
          ...updated,
          totalPrice: calculateTotalPrice(
            updated.unitPrice,
            updated.numberOfDays
          ),
        };
      }),
    }));
  };

  const handleRaiseInvoice = (itemId: string) => {
    setRaiseModalState({ itemId, invoice: null });
  };

  const handleViewHistory = (itemId: string) => {
    setHistoryItemId(itemId);
  };

  const handleEditInvoiceFromHistory = (invoiceId: string) => {
    if (!historyItem) return;

    const invoice =
      historyItem.invoices.find((entry) => entry.id === invoiceId) ?? null;

    setHistoryItemId(null);
    setRaiseModalState({ itemId: historyItem.id, invoice });
  };

  const handleAddInvoiceFromHistory = () => {
    if (!historyItem) return;

    setHistoryItemId(null);
    setRaiseModalState({ itemId: historyItem.id, invoice: null });
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

  const handleCloseRaiseModal = () => {
    setRaiseModalState(null);
  };

  const handleSaveInvoice = (invoice: InvoiceEntry) => {
    if (!raiseModalState) return;

    const { itemId } = raiseModalState;

    setProject((prev) => ({
      ...prev,
      invoiceItems: prev.invoiceItems.map((item) => {
        if (item.id !== itemId) {
          return item;
        }

        const exists = item.invoices.some((entry) => entry.id === invoice.id);

        const updatedInvoices = exists
          ? item.invoices.map((entry) =>
              entry.id === invoice.id ? invoice : entry
            )
          : [...item.invoices, invoice];

        return { ...item, invoices: updatedInvoices };
      }),
    }));

    setRaiseModalState(null);
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
                Track invoices raised against each work package and monitor
                collection progress.
              </p>
            </div>

          </div>

          <button
            onClick={handleAddRow}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition"
          >
            <Plus size={18} />
            Add Work Package
          </button>

        </div>

        {/* Body */}

        <div className="p-6 space-y-6">

          <InvoiceSummaryCards
            workOrderValueINR={project.workOrderValueINR}
            invoiceItems={project.invoiceItems}
            collectionReceived={project.paymentReceived}
          />

          <InvoiceProgressTable
            items={project.invoiceItems}
            readOnly={false}
            onFieldChange={handleFieldChange}
            onNumericFieldChange={handleNumericFieldChange}
            onRaiseInvoice={handleRaiseInvoice}
            onViewHistory={handleViewHistory}
            onDeleteRow={handleDeleteRow}
          />

        </div>

      </div>

      {raiseModalState && (
        <RaiseInvoiceModal
          invoice={raiseModalState.invoice}
          onClose={handleCloseRaiseModal}
          onSave={handleSaveInvoice}
        />
      )}

      {historyItem && (
        <InvoiceHistoryModal
          item={historyItem}
          onClose={() => setHistoryItemId(null)}
          onAddInvoice={handleAddInvoiceFromHistory}
          onEditInvoice={handleEditInvoiceFromHistory}
          onDeleteInvoice={handleDeleteInvoice}
        />
      )}
    </>
  );
};

export default InvoiceCard;
