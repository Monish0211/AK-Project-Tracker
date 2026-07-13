import { FileText, Plus, Trash2, X } from "lucide-react";

import type { InvoiceItem } from "../../../../types/InvoiceItem";

import { formatIndianCurrency } from "../../../../utils/quantityCalculations";

interface Props {
  item: InvoiceItem;
  onClose: () => void;
  onAddInvoice: () => void;
  onDeleteInvoice: (invoiceId: string) => void;
}

const BILLING_METHOD_LABELS: Record<string, string> = {
  quantity: "Quantity Progress",
  milestone: "Payment Milestone",
  manhour: "Man-Hour Progress",
  others: "Others",
};

const formatDate = (value: string): string => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const InvoiceHistoryModal = ({
  item,
  onClose,
  onAddInvoice,
  onDeleteInvoice,
}: Props) => {
  const handleDelete = (invoiceId: string) => {
    if (
      !window.confirm("Are you sure you want to delete this billing entry?")
    ) {
      return;
    }

    onDeleteInvoice(invoiceId);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50 p-5">

      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl">

        {/* Header */}

        <div className="flex justify-between items-center border-b px-6 py-5">

          <div>
            <h2 className="text-2xl font-bold">
              Billing History
            </h2>

            <p className="text-sm text-gray-500 mt-1">
              {item.description || "Work package"}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <X size={20} />
          </button>

        </div>

        {/* Body */}

        <div className="p-6 space-y-4">

          <div className="flex justify-end">
            <button
              onClick={onAddInvoice}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition"
            >
              <Plus size={16} />
              Update Billing Progress
            </button>
          </div>

          <div className="max-h-[24rem] overflow-auto rounded-xl border border-gray-100">
            <table className="min-w-full">
              <thead className="sticky top-0 z-10 bg-gray-50">
                <tr className="text-sm text-gray-600">
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Billing Method</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {item.invoices.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-14 text-center">
                      <div className="flex flex-col items-center">
                        <div className="h-16 w-16 rounded-full bg-blue-50 flex items-center justify-center">
                          <FileText size={30} className="text-blue-500" />
                        </div>
                        <h3 className="mt-4 text-lg font-semibold text-gray-700">
                          No Billing Progress Recorded Yet
                        </h3>
                        <p className="mt-2 text-sm text-gray-500 max-w-sm">
                          Click <strong>Update Billing Progress</strong> to record
                          the first billing entry for this work package.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  item.invoices.map((invoice) => (
                    <tr
                      key={invoice.id}
                      className="text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <td className="px-4 py-3">
                        {formatDate(invoice.invoiceDate)}
                      </td>

                      <td className="px-4 py-3 font-medium text-gray-800">
                        {BILLING_METHOD_LABELS[invoice.billingMethod] ?? "—"}
                        {invoice.milestoneLabel && (
                          <span className="ml-1 text-xs font-normal text-gray-400">
                            ({invoice.milestoneLabel})
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right font-semibold text-blue-700">
                        {formatIndianCurrency(invoice.invoiceAmountINR)}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleDelete(invoice.id)}
                            title="Delete"
                            className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

        </div>

        {/* Footer */}

        <div className="flex justify-end border-t px-6 py-5">
          <button
            onClick={onClose}
            className="border rounded-xl px-5 py-2.5 hover:bg-gray-100"
          >
            Close
          </button>
        </div>

      </div>

    </div>
  );
};

export default InvoiceHistoryModal;
