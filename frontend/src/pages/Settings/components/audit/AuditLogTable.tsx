import { useState } from "react";
import {
  Eye, CheckCircle2, ShieldAlert, AlertTriangle, ChevronLeft, ChevronRight,
  Database
} from "lucide-react";
import type { AuditLogItem } from "../../../../types/AuditLog";

interface Props {
  logs: AuditLogItem[];
  onSelectLog: (log: AuditLogItem) => void;
}

const ITEMS_PER_PAGE = 20;

export function AuditLogTable({ logs, onSelectLog }: Props) {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(logs.length / ITEMS_PER_PAGE) || 1;
  const safePage = Math.min(currentPage, totalPages);

  const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const visibleLogs = logs.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const renderStatusBadge = (status: AuditLogItem["status"]) => {
    if (status === "Success") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10.5px] font-bold uppercase tracking-wider">
          <CheckCircle2 size={11} />
          <span>Success</span>
        </span>
      );
    }
    if (status === "Warning") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[10.5px] font-bold uppercase tracking-wider">
          <AlertTriangle size={11} />
          <span>Warning</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 text-[10.5px] font-bold uppercase tracking-wider">
        <ShieldAlert size={11} />
        <span>Failed</span>
      </span>
    );
  };

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-[var(--nu-shadow-sm)] overflow-hidden flex flex-col">
      {/* Table Header Strip */}
      <div className="px-5 py-3.5 border-b border-[var(--nu-border)] bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database size={16} className="text-[var(--nu-accent)]" />
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
            System Audit Log Register
          </h4>
        </div>
        <span className="text-[11.5px] font-semibold text-[var(--nu-text-muted)]">
          Showing {logs.length === 0 ? 0 : startIndex + 1}–
          {Math.min(startIndex + ITEMS_PER_PAGE, logs.length)} of {logs.length} Log Records
        </span>
      </div>

      {/* Table Area */}
      <div className="overflow-x-auto nu-scrollbar min-h-[420px]">
        {logs.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Database size={32} className="mx-auto text-[var(--nu-text-muted)] opacity-50" />
            <h4 className="text-sm font-bold text-[var(--nu-text)]">No Matching Audit Logs Found</h4>
            <p className="text-xs text-[var(--nu-text-muted)] max-w-sm mx-auto">
              Try adjusting your search keywords, event type, user, or date range filters.
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse text-[12px] text-left">
            <thead>
              <tr className="bg-slate-100/70 dark:bg-slate-800/60 border-b border-[var(--nu-border)] text-[11px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Company Email</th>
                <th className="px-4 py-3">Module</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">View Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--nu-border)] font-normal text-[var(--nu-text)]">
              {visibleLogs.map((log) => (
                <tr
                  key={log.id}
                  className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-[11.5px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    {log.timestamp}
                  </td>
                  <td className="px-4 py-3 font-bold text-[var(--nu-text)] whitespace-nowrap">
                    {log.employeeName}
                    <span className="block text-[10.5px] font-mono text-[var(--nu-text-muted)] font-normal">
                      {log.employeeId}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {log.companyEmail}
                  </td>
                  <td className="px-4 py-3 font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                    {log.module}
                  </td>
                  <td className="px-4 py-3 font-semibold text-[var(--nu-text)] whitespace-nowrap">
                    {log.action}
                  </td>
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    {renderStatusBadge(log.status)}
                  </td>
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onSelectLog(log)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                      title="View full audit log details"
                    >
                      <Eye size={13} className="text-blue-500" />
                      <span>Details</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="px-5 py-3 border-t border-[var(--nu-border)] bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-between">
          <p className="text-xs font-semibold text-[var(--nu-text-muted)]">
            Page {safePage} of {totalPages}
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <ChevronLeft size={14} />
              <span>Previous</span>
            </button>

            <button
              type="button"
              disabled={safePage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
