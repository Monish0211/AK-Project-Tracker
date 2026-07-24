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
      {/* Modal Card */}
      <div className="relative w-full max-w-4xl bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-slate-700 shadow-2xl rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 px-6 py-5">
          <div>
            <h3 className="text-xl font-bold text-gray-800 dark:text-slate-100">
              Billing History Tracker
            </h3>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              Historical view of all billing entries recorded against this project.
            </p>
          </div>

          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="max-h-[26rem] overflow-auto rounded-xl border border-gray-200 dark:border-slate-700">
            <table className="min-w-full">
              <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
                <tr className="text-sm text-slate-600 dark:text-slate-300">
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

              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={readOnly ? 6 : 7} className="py-14 text-center">
                      <div className="flex flex-col items-center">
                        <div className="h-16 w-16 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                          <ClipboardList size={30} className="text-blue-500 dark:text-blue-400" />
                        </div>
                        <h3 className="mt-4 text-lg font-semibold text-gray-700 dark:text-slate-200">
                          No Billing Recorded Yet
                        </h3>
                        <p className="mt-2 text-sm text-gray-500 dark:text-slate-400 max-w-sm">
                          Click <strong>Update Billing Progress</strong> to record the first
                          billing entry for this project.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.key} className="text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                      <td className="px-4 py-3">{formatDate(row.date)}</td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
                            row.billingType === "Quantity Based"
                              ? "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300"
                              : "border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300"
                          }`}
                        >
                          {row.billingType}
                        </span>
                      </td>

                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                        {row.activity ?? row.milestone}
                      </td>

                      <td className="px-4 py-3 text-right">
                        {row.quantityProgress ?? "—"}
                      </td>

                      <td className="px-4 py-3 text-right font-semibold text-blue-700 dark:text-blue-400">
                        {formatIndianCurrency(row.amount)}
                      </td>

                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                          Completed
                        </span>
                      </td>

                      {!readOnly && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={row.onView}
                              title="View Billing"
                              className="p-1.5 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition"
                            >
                              <Eye size={16} />
                            </button>

                            <button
                              onClick={row.onEdit}
                              title="Edit Billing"
                              className="p-1.5 rounded-lg text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition"
                            >
                              <Edit2 size={16} />
                            </button>

                            <button
                              onClick={() => handleDelete(row)}
                              title="Delete Billing"
                              className="p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition"
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
        <div className="flex justify-end border-t border-gray-200 dark:border-slate-700 px-6 py-5">
          <button onClick={onClose} className="border border-gray-300 dark:border-slate-700 rounded-xl px-5 py-2.5 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold transition">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default BillingHistoryModal;
