import React from "react";
import {
  BellRing, FolderCog, Clock3, FileText, Landmark, Wallet,
  LayoutDashboard, FileStack, Settings, ArrowRight, Info,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardBody } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { useNotifications } from "../../../notifications/useNotifications";
import type { NotificationSource } from "../../../notifications/notificationTypes";

const SOURCE_ICON: Record<NotificationSource, LucideIcon> = {
  Projects: FolderCog,
  Timesheets: Clock3,
  Invoices: FileText,
  Payments: Landmark,
  "Expense Budget": Wallet,
  Dashboard: LayoutDashboard,
  Documents: FileStack,
  System: Settings,
  Reminders: BellRing,
};

const SOURCE_TINT: Record<NotificationSource, string> = {
  Projects: "text-blue-600 bg-blue-50 dark:text-blue-300 dark:bg-blue-950/40",
  Timesheets: "text-cyan-600 bg-cyan-50 dark:text-cyan-300 dark:bg-cyan-950/40",
  Invoices: "text-indigo-600 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-950/40",
  Payments: "text-emerald-600 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40",
  "Expense Budget": "text-orange-600 bg-orange-50 dark:text-orange-300 dark:bg-orange-950/40",
  Dashboard: "text-slate-600 bg-slate-100 dark:text-slate-300 dark:bg-slate-800/60",
  Documents: "text-purple-600 bg-purple-50 dark:text-purple-300 dark:bg-purple-950/40",
  System: "text-slate-600 bg-slate-100 dark:text-slate-300 dark:bg-slate-800/60",
  Reminders: "text-red-600 bg-red-50 dark:text-red-300 dark:bg-red-950/40",
};

const formatRelativeTime = (iso: string): string => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const diffMs = Date.now() - then;
  const diffMin = Math.round(diffMs / 60000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} mins ago`;

  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr${diffHr === 1 ? "" : "s"} ago`;

  const diffDay = Math.round(diffHr / 24);
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay} days ago`;

  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

/**
 * PMO Alerts — live operational notifications from the same real
 * notification engine that drives the header bell (useNotifications(),
 * reactive to the "pmo:notifications-changed" event; see
 * notificationService.ts / reminderScheduler.ts). Shows whatever this
 * engine actually generates today — rule-based alerts (hours overrun,
 * outstanding payment, project overdue, ...) and reminder triggers — rather
 * than fabricating events for integrations (Keka, Outlook) this codebase
 * doesn't call.
 */
const PMOAlertsWidget: React.FC = () => {
  const navigate = useNavigate();
  const { notifications } = useNotifications();

  const recent = notifications
    .filter((n) => !n.isArchived)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 8);

  return (
    <Card padded={false} elevated className="h-[300px] flex flex-col justify-between transition-all duration-200">
      {/* Header */}
      <CardHeader
        icon={<BellRing size={14} className="text-indigo-600 dark:text-indigo-400" />}
        title="PMO ALERTS"
        subtitle="Live operational notifications"
        iconTint="accent"
      />

      {/* Content Area */}
      <CardBody className="flex-1 overflow-y-auto custom-scrollbar my-1 pr-0.5 min-h-0">
        {recent.length === 0 ? (
          <EmptyState
            icon={<BellRing size={18} />}
            title="No alerts yet"
            description="Project, invoice, timesheet and reminder events will appear here as they happen."
          />
        ) : (
          <div className="space-y-2 px-3 sm:px-4">
            {recent.map((n, index) => {
              const Icon = SOURCE_ICON[n.source] ?? Info;
              const tint = SOURCE_TINT[n.source] ?? SOURCE_TINT.System;
              return (
                <div
                  key={n.id}
                  className={`flex items-start gap-2.5 px-1 py-1.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 rounded-lg transition-colors ${
                    index !== recent.length - 1 ? "border-b border-slate-100 dark:border-slate-800/40 pb-2" : ""
                  }`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${tint}`}>
                    <Icon size={13} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11.5px] font-bold text-slate-800 dark:text-slate-200 truncate">{n.title}</p>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold shrink-0">{formatRelativeTime(n.timestamp)}</span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug mt-0.5">{n.message}</p>
                    {n.projectCode && (
                      <p className="text-[9.5px] text-slate-400 dark:text-slate-500 font-medium mt-0.5">Ref: {n.projectCode}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardBody>

      {/* Bottom Summary Strip (Fixed) */}
      <div className="shrink-0 bg-slate-50/80 dark:bg-slate-800/40 border-t border-slate-200/60 dark:border-slate-800/60 p-2 px-3 sm:px-4 rounded-b-[var(--nu-radius-lg)] flex items-center justify-between flex-wrap gap-1.5 text-[11px] font-semibold text-slate-650 dark:text-slate-400">
        <div className="flex items-center gap-1.5 truncate">
          <Info size={13} className="text-slate-450 shrink-0" />
          <span className="truncate">Live from Projects, Invoices, Timesheets &amp; Reminders.</span>
        </div>
        <button
          type="button"
          onClick={() => navigate("/reports")}
          className="text-blue-600 dark:text-blue-400 hover:underline transition-colors flex items-center gap-1 font-bold cursor-pointer ml-auto sm:ml-0"
        >
          <span>View All</span>
          <ArrowRight size={12} />
        </button>
      </div>
    </Card>
  );
};

export default PMOAlertsWidget;
