import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, ChevronDown } from "lucide-react";
import type { ReminderToastData } from "./toastStore";
import { NotificationRoutes } from "./notificationRoutes";
import { reminderService } from "../services/reminders/ReminderService";
import type { SnoozeOption } from "../services/reminders/ReminderService";
import { reminderSoundService } from "../services/audio/ReminderSoundService";
import { ReminderTypeIcon } from "../components/ui/ReminderTypeIcon";
import { formatHumanDateString, formatHumanTime, getReminderStatusDisplay } from "../utils/reminderDisplay";
import type { ReminderTriggerStatus } from "../utils/reminderDisplay";

interface Props {
  toast: ReminderToastData;
  onDismiss: (id: string) => void;
}

const SNOOZE_OPTIONS: { option: SnoozeOption; label: string }[] = [
  { option: "5m", label: "5 Minutes" },
  { option: "10m", label: "10 Minutes" },
  { option: "30m", label: "30 Minutes" },
  { option: "1h", label: "1 Hour" },
  { option: "tomorrow", label: "Tomorrow" },
];

// This popup is portaled to document.body (see toastStore.ts), outside the
// .project-workspace-shell scope that defines the --nu-* color tokens — so
// it deliberately uses raw Tailwind colors here instead of Badge/--nu-*.
const STATUS_TEXT_CLASSES: Record<ReminderTriggerStatus, string> = {
  upcoming: "text-slate-600 dark:text-slate-300",
  "due-soon": "text-amber-600 dark:text-amber-400",
  "due-now": "text-blue-600 dark:text-blue-400",
  overdue: "text-red-600 dark:text-red-400",
};

export const ReminderToast: React.FC<Props> = ({ toast, onDismiss }) => {
  const navigate = useNavigate();
  const [now, setNow] = useState(() => new Date());
  const [phase, setPhase] = useState<"entering" | "visible" | "exiting">("entering");
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false);
  const snoozeRef = useRef<HTMLDivElement>(null);

  const { reminder } = toast;
  const trigger = getReminderStatusDisplay(reminder, now);
  const isUrgent = trigger.status === "due-now" || trigger.status === "overdue" || reminder.priority === "Critical";
  const scheduledLabel =
    formatHumanDateString(reminder.reminderDate) === "Today"
      ? formatHumanTime(reminder.reminderTime)
      : `${formatHumanDateString(reminder.reminderDate)} · ${formatHumanTime(reminder.reminderTime)}`;

  const startExit = (after: () => void) => {
    setPhase("exiting");
    reminderSoundService.stop();
    setTimeout(after, 220); // matches the exit transition duration below
  };

  const handleDismiss = () => {
    startExit(() => onDismiss(toast.id));
  };

  const handleOpenProject = () => {
    navigate(NotificationRoutes.PROJECT_EDIT(reminder.projectId));
    startExit(() => onDismiss(toast.id));
  };

  const handleSnooze = (option: SnoozeOption) => {
    reminderService.snoozeReminder(reminder, option);
    setShowSnoozeMenu(false);
    startExit(() => onDismiss(toast.id));
  };

  // Slide/fade in on mount.
  useEffect(() => {
    const id = requestAnimationFrame(() => setPhase("visible"));
    return () => cancelAnimationFrame(id);
  }, []);

  // Live countdown tick, and the visual flip to "Due Now" once the actual
  // due time passes — all from a single scheduler-fired toast, never a
  // second trigger.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // No auto-dismiss, ever — the toast stays visible until the user takes an
  // explicit action (Open Project, Snooze, or Dismiss). Project reminders
  // must never disappear on their own while someone is looking elsewhere.

  useEffect(() => {
    if (!showSnoozeMenu) return;
    const handleClickAway = (e: MouseEvent) => {
      if (snoozeRef.current && !snoozeRef.current.contains(e.target as Node)) {
        setShowSnoozeMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickAway);
    return () => document.removeEventListener("mousedown", handleClickAway);
  }, [showSnoozeMenu]);

  const phaseClasses =
    phase === "visible"
      ? "opacity-100 translate-x-0 translate-y-0"
      : "opacity-0 translate-x-6 translate-y-2";

  return (
    <div
      className={`w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl border shadow-2xl bg-white dark:bg-slate-900 overflow-hidden transition-all duration-300 ease-out ${phaseClasses} ${
        isUrgent
          ? "border-red-300 dark:border-red-900/60"
          : "border-slate-200 dark:border-slate-800"
      }`}
      role="alert"
    >
      {/* Header strip */}
      <div
        className={`flex items-center justify-between gap-2 px-3.5 py-2 border-b ${
          isUrgent
            ? "bg-red-50 dark:bg-red-950/40 border-red-100 dark:border-red-900/40"
            : "bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800"
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isUrgent ? "bg-red-500 animate-pulse" : "bg-blue-500"
            }`}
          />
          <ReminderTypeIcon
            type={reminder.reminderType}
            size={13}
            className={isUrgent ? "text-red-600 dark:text-red-400 shrink-0" : "text-blue-600 dark:text-blue-400 shrink-0"}
          />
          <span
            className={`text-[11px] font-extrabold uppercase tracking-wide truncate ${
              isUrgent ? "text-red-700 dark:text-red-300" : "text-blue-700 dark:text-blue-300"
            }`}
          >
            {reminder.reminderType} Reminder
          </span>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0"
          title="Dismiss"
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="px-3.5 py-3 space-y-2.5">
        <h4 className="text-[13.5px] font-bold text-slate-900 dark:text-white leading-snug truncate" title={reminder.title}>
          {reminder.title}
        </h4>

        <div className="grid grid-cols-[72px_1fr] gap-x-2 gap-y-1 text-[11.5px]">
          <span className="font-semibold text-slate-400 dark:text-slate-500">Project</span>
          <span className="font-bold text-slate-700 dark:text-slate-200 truncate">{reminder.projectCode || "—"}</span>

          <span className="font-semibold text-slate-400 dark:text-slate-500">Scheduled</span>
          <span className="font-bold text-slate-700 dark:text-slate-200">{scheduledLabel}</span>

          <span className="font-semibold text-slate-400 dark:text-slate-500">Status</span>
          <span className={`font-bold ${STATUS_TEXT_CLASSES[trigger.status]}`}>{trigger.detail}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="px-3.5 pb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={handleOpenProject}
          className="flex-1 text-[11.5px] font-bold px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        >
          Open Project
        </button>

        <div className="relative" ref={snoozeRef}>
          <button
            type="button"
            onClick={() => setShowSnoozeMenu((v) => !v)}
            className="flex items-center gap-1 text-[11.5px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            Snooze
            <ChevronDown size={12} />
          </button>

          {showSnoozeMenu && (
            <div className="absolute bottom-full right-0 mb-1.5 w-36 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl overflow-hidden z-10">
              {SNOOZE_OPTIONS.map(({ option, label }) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleSnooze(option)}
                  className="w-full text-left px-3 py-1.5 text-[11.5px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="text-[11.5px] font-bold px-2.5 py-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};
