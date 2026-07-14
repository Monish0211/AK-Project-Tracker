import { ClipboardList, Edit2, Eye, Trash2, X } from "lucide-react";

import type { Project } from "../../../../types/Project";
import { formatIndianCurrency } from "../../../../utils/quantityCalculations";

interface Props {
  project: Project;
  onClose: () => void;
  onDeleteQuantityEntry?: (itemId: string, invoiceId: string) => void;
  onDeleteMilestoneBilling?: (billingId: string) => void;
  onViewQuantityEntry?: (itemId: string, invoiceId: string) => void;
  onEditQuantityEntry?: (itemId: string, invoiceId: string) => void;
  onViewMilestoneBilling?: (billingId: string) => void;
  onEditMilestoneBilling?: (billingId: string) => void;
  /** View Project — hides the delete action entirely. */
  readOnly?: boolean;
}

interface HistoryRow {
  key: string;
  date: string;
  billingType: "Quantity Based" | "Payment Milestone";
  activity: string | null;
  /** e.g. "125 / 250 MAN-HOUR" — cumulative completed qty after this entry, out of the activity's total. Null for Payment Milestone rows. */
  quantityProgress: string | null;
  milestone: string | null;
  amount: number;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

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

const BillingHistoryModal = ({
  project,
  onClose,
  onDeleteQuantityEntry,
  onDeleteMilestoneBilling,
  onViewQuantityEntry,
  onEditQuantityEntry,
  onViewMilestoneBilling,
  onEditMilestoneBilling,
  readOnly = false,
}: Props) => {
  const quantityRows: HistoryRow[] = project.invoiceItems.flatMap((item) => {
    // Running total in chronological (save) order, so each entry shows the
    // cumulative completed qty as of that entry — always matching what was
    // actually saved.
    let runningCompleted = 0;

    return (item.invoices ?? []).map((invoice) => {
      runningCompleted += invoice.quantityBilled || 0;

      return {
        key: `qty-${invoice.id}`,
        date: invoice.invoiceDate,
        billingType: "Quantity Based" as const,
        activity: item.description || "—",
        quantityProgress: `${runningCompleted} / ${item.qty} ${item.uom}`,
        milestone: null,
        amount: invoice.invoiceAmountINR,
        onView: () => onViewQuantityEntry?.(item.id, invoice.id),
        onEdit: () => onEditQuantityEntry?.(item.id, invoice.id),
        onDelete: () => onDeleteQuantityEntry?.(item.id, invoice.id),
      };
    });
  });

  const milestoneRows: HistoryRow[] = (project.milestoneBillings ?? []).map((billing) => ({
    key: `milestone-${billing.id}`,
    date: billing.invoiceDate,
    billingType: "Payment Milestone" as const,
    activity: null,
    quantityProgress: null,
    milestone: `${billing.milestoneName} (${billing.milestonePercentage}%)`,
    amount: billing.amount,
    onView: () => onViewMilestoneBilling?.(billing.id),
    onEdit: () => onEditMilestoneBilling?.(billing.id),
    onDelete: () => onDeleteMilestoneBilling?.(billing.id),
  }));

  const rows = [...quantityRows, ...milestoneRows].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const handleDelete = (row: HistoryRow) => {
    if (!window.confirm("Are you sure you want to delete this billing record?")) {
      return;
    }

    row.onDelete();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50 p-5">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl">
        {/* Header */}
        <div className="flex justify-between items-center border-b px-6 py-5">
          <div>
            <h2 className="text-2xl font-bold">Billing History</h2>
            <p className="text-sm text-gray-500 mt-1">
              All Quantity Based and Payment Milestone billing raised for this project.
            </p>
          </div>

          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="max-h-[26rem] overflow-auto rounded-xl border border-gray-100">
            <table className="min-w-full">
              <thead className="sticky top-0 z-10 bg-gray-50">
                <tr className="text-sm text-gray-600">
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Billing Type</th>
                  <th className="px-4 py-3 text-left">Activity / Milestone</th>
                  <th className="px-4 py-3 text-right">Quantity Progress</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  {!readOnly && (
                    <th className="px-4 py-3 text-center">Action</th>
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={readOnly ? 6 : 7} className="py-14 text-center">
                      <div className="flex flex-col items-center">
                        <div className="h-16 w-16 rounded-full bg-blue-50 flex items-center justify-center">
                          <ClipboardList size={30} className="text-blue-500" />
                        </div>
                        <h3 className="mt-4 text-lg font-semibold text-gray-700">
                          No Billing Recorded Yet
                        </h3>
                        <p className="mt-2 text-sm text-gray-500 max-w-sm">
                          Click <strong>Update Billing Progress</strong> to record the first
                          billing entry for this project.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.key} className="text-sm text-gray-700 hover:bg-gray-50">
                      <td className="px-4 py-3">{formatDate(row.date)}</td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
                            row.billingType === "Quantity Based"
                              ? "border-blue-200 bg-blue-50 text-blue-700"
                              : "border-purple-200 bg-purple-50 text-purple-700"
                          }`}
                        >
                          {row.billingType}
                        </span>
                      </td>

                      <td className="px-4 py-3 font-medium text-gray-800">
                        {row.activity ?? row.milestone}
                      </td>

                      <td className="px-4 py-3 text-right">
                        {row.quantityProgress ?? "—"}
                      </td>

                      <td className="px-4 py-3 text-right font-semibold text-blue-700">
                        {formatIndianCurrency(row.amount)}
                      </td>

                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
                          Completed
                        </span>
                      </td>

                      {!readOnly && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={row.onView}
                              title="View Billing"
                              className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition"
                            >
                              <Eye size={16} />
                            </button>

                            <button
                              onClick={row.onEdit}
                              title="Edit Billing"
                              className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 transition"
                            >
                              <Edit2 size={16} />
                            </button>

                            <button
                              onClick={() => handleDelete(row)}
                              title="Delete Billing"
                              className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t px-6 py-5">
          <button onClick={onClose} className="border rounded-xl px-5 py-2.5 hover:bg-gray-100">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default BillingHistoryModal;
