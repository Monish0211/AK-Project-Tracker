import React from "react";
import { Activity, FolderPlus, FolderCog, FileText, Landmark, StickyNote, ArrowRight, Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardBody } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import { EmptyState } from "../../../components/ui/EmptyState";
import type { CardTint } from "../../../components/ui/Card";
import { getRecentActivity, type ActivityEvent } from "../../../services/dashboardService";

const CATEGORY_META: Record<
  ActivityEvent["category"],
  { icon: LucideIcon; tint: string; badgeTone: CardTint }
> = {
  Project: { icon: FolderPlus, tint: "text-blue-600 bg-blue-50 dark:text-blue-300 dark:bg-blue-950/40", badgeTone: "accent" },
  Invoice: { icon: FileText, tint: "text-indigo-600 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-950/40", badgeTone: "info" },
  Payment: { icon: Landmark, tint: "text-emerald-600 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40", badgeTone: "success" },
  Notes: { icon: StickyNote, tint: "text-cyan-600 bg-cyan-50 dark:text-cyan-300 dark:bg-cyan-950/40", badgeTone: "neutral" },
};

const ICON_OVERRIDE: Partial<Record<string, LucideIcon>> = {
  "Project Updated": FolderCog,
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

const ActivityFeed: React.FC = () => {
  const navigate = useNavigate();
  const events = getRecentActivity(10);

  return (
    <Card padded={false} className="h-[325px] flex flex-col justify-between bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-md rounded-[var(--nu-radius-lg)] hover:shadow-lg transition-all duration-200">
      {/* Header */}
      <CardHeader
        icon={<Activity size={14} className="text-blue-600 dark:text-blue-400" />}
        title="RECENT ACTIVITY"
        subtitle="Live project timeline"
        action={
          <button
            type="button"
            onClick={() => navigate("/reports")}
            className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors flex items-center gap-1 hover:underline cursor-pointer shrink-0"
          >
            <span>View All</span>
            <ArrowRight size={12} />
          </button>
        }
      />

      {/* Content Area */}
      <CardBody className="flex-1 overflow-y-auto custom-scrollbar my-1 pr-0.5 min-h-0">
        {events.length === 0 ? (
          <EmptyState
            icon={<Activity size={18} />}
            title="No activity yet"
            description="Project, invoice and note updates will appear here as they happen."
          />
        ) : (
          <div className="space-y-2 px-3 sm:px-4">
            {events.map((event, index) => {
              const meta = CATEGORY_META[event.category];
              const Icon = ICON_OVERRIDE[event.title] ?? meta.icon;
              return (
                <div
                  key={event.id}
                  className={`flex items-start gap-2.5 px-1 py-1.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 rounded-lg transition-colors ${
                    index !== events.length - 1 ? "border-b border-slate-100 dark:border-slate-800/40 pb-2" : ""
                  }`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${meta.tint}`}>
                    <Icon size={13} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-[11.5px] font-bold text-slate-800 dark:text-slate-200 truncate">{event.title}</p>
                        <Badge tone={meta.badgeTone} className="text-[9px] px-1.5 py-0">
                          {event.category}
                        </Badge>
                      </div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold shrink-0">{formatRelativeTime(event.timestamp)}</span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug mt-0.5">{event.description}</p>
                    {event.projectRef && (
                      <p className="text-[9.5px] text-slate-400 dark:text-slate-500 font-medium mt-0.5">Ref: {event.projectRef}</p>
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
          <span className="truncate">Showing latest activity events feed.</span>
        </div>
        <button
          type="button"
          onClick={() => navigate("/reports")}
          className="text-blue-600 dark:text-blue-400 hover:underline transition-colors flex items-center gap-1 font-bold cursor-pointer ml-auto sm:ml-0"
        >
          <span>View All Activity</span>
          <ArrowRight size={12} />
        </button>
      </div>
    </Card>
  );
};

export default ActivityFeed;
