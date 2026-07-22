import React from "react";
import { CheckCircle2, Clock, Trash2, Edit2, Calendar, Bell, ExternalLink, RefreshCw } from "lucide-react";
import type { ProjectReminder } from "../../types/ProjectReminder";
import { reminderService } from "../../services/reminders/ReminderService";
import { useNavigate } from "react-router-dom";
import { NotificationRoutes } from "../../notifications/notificationRoutes";

interface Props {
  reminder: ProjectReminder;
  onEdit: (reminder: ProjectReminder) => void;
  readOnly?: boolean;
}

export const ReminderCard: React.FC<Props> = ({ reminder, onEdit, readOnly }) => {
  const navigate = useNavigate();
  
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

  // Status Styling
  let statusClasses = "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300";
  if (reminder.status === "Completed") {
    statusClasses = "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:border-green-800 dark:text-green-300";
  } else if (reminder.priority === "Critical") {
    statusClasses = "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:border-red-800 dark:text-red-300";
  } else if (reminder.priority === "High") {
    statusClasses = "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-300";
  }

  return (
    <div className={`p-4 rounded-xl border transition-all ${statusClasses} shadow-sm group`}>
      <div className="flex justify-between items-start gap-4">
        
        {/* Main Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/60 dark:bg-black/20 border border-black/5 dark:border-white/5 truncate max-w-[120px]">
              {reminder.reminderType}
            </span>
            {reminder.projectCode && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {reminder.projectCode}
              </span>
            )}
            {reminder.repeat !== "None" && (
              <span title={`Repeats: ${reminder.repeat}`}>
                <RefreshCw size={12} className="text-slate-400 dark:text-slate-500" />
              </span>
            )}
          </div>
          
          <h3 className={`text-sm font-bold truncate ${reminder.isCompleted ? 'line-through opacity-70' : ''}`}>
            {reminder.title}
          </h3>
          
          {reminder.description && (
            <p className="text-xs mt-1.5 opacity-80 line-clamp-2 leading-relaxed">
              {reminder.description}
            </p>
          )}

          <div className="flex items-center gap-4 mt-3 text-[11px] font-semibold opacity-80">
            <div className="flex items-center gap-1.5">
              <Calendar size={13} />
              {reminder.reminderDate}
            </div>
            {reminder.reminderTime && (
              <div className="flex items-center gap-1.5">
                <Clock size={13} />
                {reminder.reminderTime}
              </div>
            )}
            {reminder.notifyOffset !== "At Due Time" && (
              <div className="flex items-center gap-1.5" title={`Notifies ${reminder.notifyOffset}`}>
                <Bell size={13} />
                {reminder.notifyOffset}
              </div>
            )}
          </div>
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
