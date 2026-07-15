import { Activity, FolderCog, FolderPlus, Landmark, FileText, StickyNote, Users, CalendarCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ProjectActivityEvent, ProjectActivityCategory } from "../../../../services/projectActivityService";
import { Badge } from "../../../../components/ui/Badge";
import { EmptyState } from "../../../../components/ui/EmptyState";
import type { CardTint } from "../../../../components/ui/Card";

interface Props {
  events: ProjectActivityEvent[];
}

const CATEGORY_META: Record<ProjectActivityCategory, { icon: LucideIcon; tint: string; badgeTone: CardTint }> = {
  Project: { icon: FolderPlus, tint: "text-blue-600 bg-blue-100 dark:text-blue-300 dark:bg-blue-500/15", badgeTone: "accent" },
  Invoice: { icon: FileText, tint: "text-indigo-600 bg-indigo-100 dark:text-indigo-300 dark:bg-indigo-500/15", badgeTone: "info" },
  Payment: { icon: Landmark, tint: "text-emerald-600 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-500/15", badgeTone: "success" },
  Notes: { icon: StickyNote, tint: "text-cyan-600 bg-cyan-100 dark:text-cyan-300 dark:bg-cyan-500/15", badgeTone: "neutral" },
  Team: { icon: Users, tint: "text-purple-600 bg-purple-100 dark:text-purple-300 dark:bg-purple-500/15", badgeTone: "accent" },
  Milestone: { icon: CalendarCheck, tint: "text-amber-600 bg-amber-100 dark:text-amber-300 dark:bg-amber-500/15", badgeTone: "warning" },
};

const ICON_OVERRIDE: Partial<Record<string, LucideIcon>> = {
  "Project Updated": FolderCog,
};

const formatDateTime = (iso: string): { date: string; time: string } => {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
  };
};

const ProjectActivityTimeline = ({ events }: Props) => {
  if (events.length === 0) {
    return (
      <EmptyState
        icon={<Activity size={18} />}
        title="No activity recorded yet"
        description="Project, invoice, note, milestone and team updates will appear here as they happen."
      />
    );
  }

  return (
    <div className="max-w-3xl">
      {events.map((event, index) => {
        const meta = CATEGORY_META[event.category];
        const Icon = ICON_OVERRIDE[event.title] ?? meta.icon;
        const { date, time } = formatDateTime(event.timestamp);

        return (
          <div
            key={event.id}
            className={`flex items-start gap-3 py-3 ${index !== events.length - 1 ? "border-b border-[var(--nu-border)]" : ""}`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${meta.tint}`}>
              <Icon size={14} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="text-[13px] font-semibold text-[var(--nu-text)] truncate">{event.title}</p>
                  <Badge tone={meta.badgeTone} className="shrink-0">
                    {event.category}
                  </Badge>
                </div>
                <span className="text-[11px] text-[var(--nu-text-muted)] shrink-0 whitespace-nowrap">
                  {date} · {time}
                </span>
              </div>
              <p className="text-[13px] text-[var(--nu-text-secondary)] leading-snug mt-1">{event.description}</p>
              {event.user && <p className="text-[11px] text-[var(--nu-text-muted)] mt-0.5">By {event.user}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ProjectActivityTimeline;
