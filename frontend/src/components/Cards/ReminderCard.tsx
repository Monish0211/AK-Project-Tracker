import React, { useEffect, useState } from "react";
import { CheckCircle2, Trash2, Edit2, Calendar, Clock, Bell, ExternalLink, RefreshCw } from "lucide-react";
import type { ProjectReminder } from "../../types/ProjectReminder";
import { reminderService } from "../../services/reminders/ReminderService";
import { useNavigate } from "react-router-dom";
import { NotificationRoutes } from "../../notifications/notificationRoutes";
import { Badge } from "../ui/Badge";
import { ReminderTypeIcon } from "../ui/ReminderTypeIcon";
import {
  formatHumanDateString,
  formatHumanTime,
  getReminderStatusDisplay,
  reminderPriorityTone,
  reminderStatusTone,
} from "../../utils/reminderDisplay";

interface Props {
  reminder: ProjectReminder;
  onEdit: (reminder: ProjectReminder) => void;
  readOnly?: boolean;
}

const PRIORITY_STRIPE: Record<ProjectReminder["priority"], string> = {
  Critical: "border-l-red-900 dark:border-l-red-700",
  High: "border-l-[var(--nu-danger)]",
  Medium: "border-l-[var(--nu-warning)]",
  Low: "border-l-[var(--nu-success)]",
};

const STATUS_TEXT_TONE: Record<string, string> = {
  overdue: "text-[var(--nu-danger)]",
  "due-now": "text-[var(--nu-accent)]",
  "due-soon": "text-[var(--nu-warning)]",
  upcoming: "text-[var(--nu-text-muted)]",
};

export const ReminderCard: React.FC<Props> = ({ reminder, onEdit, readOnly }) => {
  const navigate = useNavigate();

  // Re-renders every 30s so the trigger-status badge and countdown text
  // (Upcoming -> Due Soon -> Due Now -> Overdue) stay live without a reload.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const handleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    reminderService.updateReminder(reminder.id, { status: "Completed" });
  };

  const handleReopen = (e: React.MouseEvent) => {
    e.stopPropagation();
    reminderService.updateReminder(reminder.id, { status: "Pending" });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this reminder?")) {
      reminderService.deleteReminder(reminder.id);
    }
  };

  const handleOpenProject = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(NotificationRoutes.PROJECT_EDIT(reminder.projectId));
  };

  const isActive = reminder.status === "Pending";
  const trigger = getReminderStatusDisplay(reminder, now);

  return (
    <div
      className={`p-4 rounded-xl border border-l-4 bg-[var(--nu-surface)] border-[var(--nu-border)] ${PRIORITY_STRIPE[reminder.priority]} transition-all shadow-sm group`}
    >
      <div className="flex justify-between items-start gap-4">

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] text-[var(--nu-text-secondary)] truncate max-w-[140px]">
              <ReminderTypeIcon type={reminder.reminderType} size={11} className="shrink-0" />
              {reminder.reminderType}
            </span>
            {reminder.projectCode && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--nu-text-muted)]">
                {reminder.projectCode}
              </span>
            )}
            {reminder.repeat !== "None" && (
              <span title={`Repeats: ${reminder.repeat}`}>
                <RefreshCw size={12} className="text-[var(--nu-text-muted)]" />
              </span>
            )}
            {isActive && <Badge tone={reminderStatusTone(trigger.status)} dot>{trigger.label}</Badge>}
            <Badge tone={reminderPriorityTone(reminder.priority)}>{reminder.priority}</Badge>
          </div>

          <h3 className={`text-sm font-bold truncate text-[var(--nu-text)] ${reminder.isCompleted ? 'line-through opacity-70' : ''}`}>
            {reminder.title}
          </h3>

          {reminder.description && (
            <p className="text-xs mt-1.5 text-[var(--nu-text-muted)] line-clamp-2 leading-relaxed">
              {reminder.description}
            </p>
          )}

          <div className="flex items-center gap-4 mt-3 text-[11px] font-semibold text-[var(--nu-text-secondary)] flex-wrap">
            <div className="flex items-center gap-1.5">
              <Calendar size={13} />
              {formatHumanDateString(reminder.reminderDate)}
            </div>
            {reminder.reminderTime && (
              <div className="flex items-center gap-1.5">
                <Clock size={13} />
                {formatHumanTime(reminder.reminderTime)}
              </div>
            )}
            {reminder.notifyOffset !== "At Due Time" && (
              <div className="flex items-center gap-1.5" title={`Notifies ${reminder.notifyOffset}`}>
                <Bell size={13} />
                Notify {reminder.notifyOffset}
              </div>
            )}
          </div>

          {isActive && (
            <p className={`text-[11px] font-bold mt-1.5 ${STATUS_TEXT_TONE[trigger.status]}`}>
              {trigger.detail}
            </p>
          )}
        </div>

        {/* Action Buttons */}
        {!readOnly && (
          <div className="flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {reminder.status === "Pending" ? (
              <button 
                onClick={handleComplete}
                className="p-1.5 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/50 text-green-600 dark:text-green-400 transition-colors"
                title="Mark as Completed"
              >
                <CheckCircle2 size={16} />
              </button>
            ) : (
              <button 
                onClick={handleReopen}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition-colors"
                title="Reopen Reminder"
              >
                <RefreshCw size={16} />
              </button>
            )}
            
            <button 
              onClick={(e) => { e.stopPropagation(); onEdit(reminder); }}
              className="p-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 transition-colors"
              title="Edit Reminder"
            >
              <Edit2 size={16} />
            </button>

            <button 
              onClick={handleOpenProject}
              className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors"
              title="Open Project"
            >
              <ExternalLink size={16} />
            </button>

            <button 
              onClick={handleDelete}
              className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 transition-colors"
              title="Delete Reminder"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
