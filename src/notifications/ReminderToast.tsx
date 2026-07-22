import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, X, FolderKanban, Tag, ChevronDown } from "lucide-react";
import type { ReminderToastData } from "./toastStore";
import { NotificationRoutes } from "./notificationRoutes";
import { reminderService } from "../services/reminders/ReminderService";
import type { SnoozeOption } from "../services/reminders/ReminderService";
import { reminderSoundService } from "../services/audio/ReminderSoundService";

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

const formatCountdown = (ms: number): string => {
  if (ms <= 0) return "Due Now";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `Due in ${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Due in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Due in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `Due in ${days} day${days === 1 ? "" : "s"}`;
};

export const ReminderToast: React.FC<Props> = ({ toast, onDismiss }) => {
  const navigate = useNavigate();
  const [now, setNow] = useState(() => new Date());
  const [phase, setPhase] = useState<"entering" | "visible" | "exiting">("entering");
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false);
  const snoozeRef = useRef<HTMLDivElement>(null);

  const { reminder } = toast;
  const dueAt = useMemo(() => new Date(toast.dueAt), [toast.dueAt]);
  const msRemaining = dueAt.getTime() - now.getTime();
  const isDueNow = msRemaining <= 0;
  const isCritical = isDueNow || reminder.priority === "Critical";

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
        isCritical
          ? "border-red-300 dark:border-red-900/60"
          : "border-slate-200 dark:border-slate-800"
      }`}
      role="alert"
    >
      {/* Header strip */}
      <div
        className={`flex items-center justify-between gap-2 px-3.5 py-2 border-b ${
          isCritical
            ? "bg-red-50 dark:bg-red-950/40 border-red-100 dark:border-red-900/40"
            : "bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800"
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isCritical ? "bg-red-500 animate-pulse" : "bg-blue-500"
            }`}
          />
          <Bell
            size={13}
            className={isCritical ? "text-red-600 dark:text-red-400 shrink-0" : "text-blue-600 dark:text-blue-400 shrink-0"}
          />
          <span
            className={`text-[11px] font-extrabold uppercase tracking-wide truncate ${
              isCritical ? "text-red-700 dark:text-red-300" : "text-blue-700 dark:text-blue-300"
            }`}
          >
            {isDueNow ? "Reminder Due Now" : "Reminder"}
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
      <div className="px-3.5 py-3 space-y-2">
        <h4 className="text-[13.5px] font-bold text-slate-900 dark:text-white leading-snug truncate" title={reminder.title}>
          {reminder.title}
        </h4>

        <div className="flex items-center gap-3 flex-wrap text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <FolderKanban size={12} className="shrink-0" />
            {reminder.projectCode || "—"}
          </span>
          <span className="flex items-center gap-1">
            <Tag size={12} className="shrink-0" />
            {reminder.reminderType}
          </span>
        </div>

        <p
          className={`text-[12px] font-bold ${
            isDueNow ? "text-red-600 dark:text-red-400" : "text-slate-700 dark:text-slate-300"
          }`}
        >
          {formatCountdown(msRemaining)}
        </p>
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
