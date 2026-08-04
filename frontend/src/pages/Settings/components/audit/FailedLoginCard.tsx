import { ShieldAlert, AlertTriangle } from "lucide-react";
import type { FailedLoginRecord } from "../../../../types/AuditLog";

interface Props {
  records: FailedLoginRecord[];
}

export function FailedLoginCard({ records }: Props) {
  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] p-4 shadow-[var(--nu-shadow-sm)] space-y-3">
      <div className="flex items-center justify-between border-b border-[var(--nu-border)] pb-2.5">
        <div className="flex items-center gap-2">
          <ShieldAlert size={16} className="text-amber-500" />
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
            Failed Login Attempts & Security Blocklist
          </h4>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[10.5px] font-bold">
          {records.length} Failed Attempts
        </span>
      </div>

      <div className="overflow-x-auto nu-scrollbar">
        <table className="w-full border-collapse text-[11.5px] text-left">
          <thead>
            <tr className="bg-slate-100/70 dark:bg-slate-800/60 border-b border-[var(--nu-border)] text-[10.5px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              <th className="px-3 py-2">Company Email</th>
              <th className="px-3 py-2">Attempt Time</th>
              <th className="px-3 py-2">IP Address</th>
              <th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--nu-border)] font-normal text-[var(--nu-text)]">
            {records.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                <td className="px-3 py-2 font-semibold text-[var(--nu-text)] whitespace-nowrap">
                  {row.companyEmail}
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                  {row.attemptTime}
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                  {row.ipAddress}
                </td>
                <td className="px-3 py-2 text-amber-700 dark:text-amber-400 font-medium whitespace-nowrap">
                  {row.reason}
                </td>
                <td className="px-3 py-2 text-center whitespace-nowrap">
                  {row.status === "Blocked" ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 font-bold text-[10px] uppercase">
                      <ShieldAlert size={10} /> Blocked
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 font-bold text-[10px] uppercase">
                      <AlertTriangle size={10} /> Failed
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
