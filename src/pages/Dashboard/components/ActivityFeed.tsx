import { Activity, FolderPlus, FolderCog, FileText, Landmark, StickyNote } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardHeader, CardBody } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import { EmptyState } from "../../../components/ui/EmptyState";
import type { CardTint } from "../../../components/ui/Card";
import { getRecentActivity, type ActivityEvent } from "../../../services/dashboardService";

const CATEGORY_META: Record<
  ActivityEvent["category"],
  { icon: LucideIcon; tint: string; badgeTone: CardTint }
> = {
  Project: { icon: FolderPlus, tint: "text-blue-600 bg-blue-100 dark:text-blue-300 dark:bg-blue-500/15", badgeTone: "accent" },
  Invoice: { icon: FileText, tint: "text-indigo-600 bg-indigo-100 dark:text-indigo-300 dark:bg-indigo-500/15", badgeTone: "info" },
  Payment: { icon: Landmark, tint: "text-emerald-600 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-500/15", badgeTone: "success" },
  Notes: { icon: StickyNote, tint: "text-cyan-600 bg-cyan-100 dark:text-cyan-300 dark:bg-cyan-500/15", badgeTone: "neutral" },
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
  if (diffMin < 60) return `${diffMin} min ago`;

  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr${diffHr === 1 ? "" : "s"} ago`;

  const diffDay = Math.round(diffHr / 24);
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay} days ago`;

  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const ActivityFeed = () => {
  const events = getRecentActivity(8);

  return (
    <Card padded={false} elevated className="h-full flex flex-col">
      <CardHeader icon={<Activity size={15} />} title="Recent Activity" subtitle="Live project timeline" />
      <CardBody className="flex-1 max-h-[300px] overflow-y-auto nu-scrollbar">
        {events.length === 0 ? (
          <EmptyState
            icon={<Activity size={18} />}
            title="No activity yet"
            description="Project, invoice and note updates will appear here as they happen."
          />
        ) : (
          <div>
            {events.map((event, index) => {
              const meta = CATEGORY_META[event.category];
              const Icon = ICON_OVERRIDE[event.title] ?? meta.icon;
              return (
                <div
                  key={event.id}
                  className={`flex items-start gap-3 px-1 py-2.5 hover:bg-[var(--nu-surface-alt)] transition-colors ${
                    index !== events.length - 1 ? "border-b border-[var(--nu-border)]" : ""
                  }`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${meta.tint}`}>
                    <Icon size={13} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-[12.5px] font-semibold text-[var(--nu-text)] truncate">{event.title}</p>
                        <Badge tone={meta.badgeTone} className="shrink-0">
                          {event.category}
                        </Badge>
                      </div>
                      <span className="text-[10.5px] text-[var(--nu-text-muted)] shrink-0">{formatRelativeTime(event.timestamp)}</span>
                    </div>
                    <p className="text-[13px] text-[var(--nu-text-secondary)] leading-snug mt-1">{event.description}</p>
                    {event.projectRef && (
                      <p className="text-[10.5px] text-[var(--nu-text-muted)] mt-0.5">Ref: {event.projectRef}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );
};

export default ActivityFeed;
