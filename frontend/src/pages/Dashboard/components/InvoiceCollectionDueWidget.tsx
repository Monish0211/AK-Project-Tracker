import React from "react";
import { ArrowRight, Receipt, Info, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getInvoiceReceivables, type ReceivableStatus } from "../../../services/dashboardService";
import { Badge } from "../../../components/ui/Badge";
import { formatBusinessINR } from "../../../utils/formatCurrency";

const STATUS_BADGE_TONE: Record<ReceivableStatus, "warning" | "success" | "danger"> = {
  "Due Soon": "warning",
  "On Track": "success",
  Overdue: "danger",
};

const VISIBLE_ROWS = 5;

/**
 * Invoice Collection Due — project-centric receivables list (PR / Client /
 * Outstanding Amount / Status / Days), so PMO can immediately see WHICH
 * project owes what instead of just an aggregate bucket total. See
 * getInvoiceReceivables() for the due-date proxy this relies on (invoice
 * lines don't carry their own due date). Refreshes automatically with the
 * rest of the dashboard whenever an invoice is raised, edited, or marked
 * Paid (pmo:data-changed → useLiveRefresh).
 */
const InvoiceCollectionDueWidget: React.FC = () => {
  const navigate = useNavigate();
  const receivables = getInvoiceReceivables();
  const visibleReceivables = receivables.slice(0, VISIBLE_ROWS);
  const totalOutstandingINR = receivables.reduce((sum, r) => sum + r.totalOutstandingINR, 0);
  const totalPendingInvoices = receivables.reduce((sum, r) => sum + r.pendingInvoiceCount, 0);
  const hasReceivables = receivables.length > 0;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-md border border-amber-200 dark:border-amber-900/60 p-3 sm:p-3.5 h-[300px] flex flex-col justify-between transition-all duration-200 hover:shadow-lg">
      {/* Header (Fixed) */}
      <div className="shrink-0 pb-1.5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-3 h-3 rounded-full bg-amber-500 shrink-0 animate-pulse shadow-xs" />
            <h3 className="text-xs sm:text-sm font-extrabold tracking-wide uppercase text-amber-600 dark:text-amber-400 leading-tight flex items-center gap-1 truncate">
              <span className="truncate">INVOICE COLLECTION DUE</span>
              <span title="Outstanding receivables by project, most recently raised first.">
                <Info size={13} className="text-slate-400 dark:text-slate-500 hover:text-amber-500 transition-colors cursor-help shrink-0" />
              </span>
            </h3>
          </div>

          <button
            type="button"
            onClick={() => navigate("/reports")}
            className="text-[11px] font-semibold text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 transition-colors flex items-center gap-1 hover:underline cursor-pointer shrink-0"
          >
            <span>View All ({receivables.length})</span>
            <ArrowRight size={12} />
          </button>
        </div>

        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight truncate">
          Real-time receivables by project.
        </p>
      </div>

      {/* Scrollable Receivables Table */}
      {hasReceivables ? (
        <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar my-1 pr-0.5">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs">
              <tr className="border-b border-amber-100 dark:border-amber-900/40 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[9.5px] bg-amber-50/60 dark:bg-slate-800/60">
                <th className="py-1.5 px-2 rounded-l-lg">PR NO.</th>
                <th className="py-1.5 px-2">CLIENT</th>
                <th className="py-1.5 px-2 text-right">AMOUNT</th>
                <th className="py-1.5 px-2 text-right rounded-r-lg">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-[11px]">
              {visibleReceivables.map((row) => (
                <tr
                  key={row.projectId}
                  onClick={() => navigate(`/projects/view/${row.projectId}`)}
                  className="hover:bg-amber-50/40 dark:hover:bg-slate-800/50 transition-colors duration-150 cursor-pointer"
                >
                  <td className="py-1.5 px-2 font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">{row.prNo}</td>
                  <td className="py-1.5 px-2">
                    <div className="truncate max-w-[110px] font-semibold text-slate-600 dark:text-slate-400" title={row.client}>
                      {row.client}
                    </div>
                  </td>
                  <td className="py-1.5 px-2 text-right font-extrabold text-slate-900 dark:text-white whitespace-nowrap">
                    {formatBusinessINR(row.totalOutstandingINR)}
                  </td>
                  <td className="py-1.5 px-2 text-right whitespace-nowrap">
                    <Badge tone={STATUS_BADGE_TONE[row.status]} dot className="text-[9.5px]">
                      {row.status}
                    </Badge>
                    <p className="text-[9.5px] text-slate-400 dark:text-slate-500 font-medium mt-0.5">{row.daysLabel}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Empty State */
        <div className="flex-1 flex flex-col items-center justify-center text-center p-3">
          <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300/50 dark:border-emerald-800/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-1.5 shadow-xs">
            <CheckCircle2 size={20} />
          </div>
          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">All Collected</h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 max-w-sm">
            No outstanding receivables against any project.
          </p>
        </div>
      )}

      {/* Bottom Summary Strip (Fixed) */}
      <div className="shrink-0 bg-amber-50/80 dark:bg-amber-950/30 border-t border-amber-100 dark:border-amber-900/40 -mx-3 sm:-mx-3.5 -mb-3 sm:-mb-3.5 p-2 px-3 sm:px-4 rounded-b-2xl flex items-center justify-between flex-wrap gap-1.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
        <div className="flex items-center gap-1.5 truncate">
          <Receipt size={13} className="text-amber-600 shrink-0" />
          <span className="truncate">
            {formatBusinessINR(totalOutstandingINR)} Outstanding · {totalPendingInvoices} Pending {totalPendingInvoices === 1 ? "Invoice" : "Invoices"}
          </span>
        </div>

        <button
          type="button"
          onClick={() => navigate("/reports")}
          className="text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-white transition-colors flex items-center gap-1 font-bold hover:underline cursor-pointer ml-auto sm:ml-0 shrink-0"
        >
          <span>View All Receivables</span>
          <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
};

export default InvoiceCollectionDueWidget;
