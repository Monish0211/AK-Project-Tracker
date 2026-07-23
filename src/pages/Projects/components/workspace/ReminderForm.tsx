import React, { useState, useEffect } from "react";
import { X, Save, Bell } from "lucide-react";
import type {
  ProjectReminder,
  ReminderPriority,
  ReminderNotifyOffset,
  ReminderRepeat,
  ReminderStatus
} from "../../../../types/ProjectReminder";
import { NOTIFY_OFFSET_OPTIONS } from "../../../../types/ProjectReminder";
import { getReminderPreview } from "../../../../utils/reminderDisplay";

interface Props {
  reminder?: ProjectReminder | null;
  projectId: string;
  projectCode: string;
  onSave: (reminderData: Partial<ProjectReminder>) => void;
  onCancel: () => void;
}

const REMINDER_TYPES = [
  "Invoice", "Client Meeting", "Payment Follow-up", "Budget Review", 
  "Document Submission", "Deliverable", "Timesheet", "Contract", "Milestone", "Custom"
];

const PRIORITIES: ReminderPriority[] = ["Critical", "High", "Medium", "Low"];
const REPEATS: ReminderRepeat[] = ["None", "Daily", "Weekly", "Monthly", "Yearly"];

export const ReminderForm: React.FC<Props> = ({ reminder, projectId, projectCode, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    reminderType: "Invoice",
    priority: "Medium" as ReminderPriority,
    status: "Pending" as ReminderStatus,
    reminderDate: new Date().toISOString().split("T")[0],
    reminderTime: "09:00",
    notifyOffset: "10 Minutes Before" as ReminderNotifyOffset,
    repeat: "None" as ReminderRepeat,
  });

  useEffect(() => {
    if (reminder) {
      setFormData({
        title: reminder.title,
        description: reminder.description || "",
        reminderType: reminder.reminderType,
        priority: reminder.priority,
        status: reminder.status,
        reminderDate: reminder.reminderDate,
        reminderTime: reminder.reminderTime,
        notifyOffset: reminder.notifyOffset,
        repeat: reminder.repeat,
      });
    }
  }, [reminder]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    onSave({
      ...formData,
      projectId,
      projectCode,
      createdBy: reminder?.createdBy || "Administrator", // Hardcoded for now per PMO standard
    });
  };

  const preview = getReminderPreview(formData.reminderDate, formData.reminderTime, formData.notifyOffset);

  return (
    <div className="flex flex-col h-auto max-h-full min-h-0 relative overflow-hidden bg-slate-50 dark:bg-[#0F172A]">
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur-md z-10">
        <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          {reminder ? "Edit Reminder" : "New Reminder"}
        </h3>
        <button onClick={onCancel} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md transition-colors" title="Close">
          <X size={18} />
        </button>
      </div>

      <div className="overflow-y-auto p-4 custom-scrollbar shrink min-h-0">
        <form id="reminder-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
              Reminder Title *
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all dark:text-white"
              placeholder="e.g. Submit July Invoice"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
                Type
              </label>
              <select
                value={formData.reminderType}
                onChange={(e) => setFormData({...formData, reminderType: e.target.value})}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
              >
                {REMINDER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
                Priority
              </label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({...formData, priority: e.target.value as ReminderPriority})}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
              >
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
                Due Date *
              </label>
              <input
                type="date"
                required
                value={formData.reminderDate}
                onChange={(e) => setFormData({...formData, reminderDate: e.target.value})}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
                Time
              </label>
              <input
                type="time"
                value={formData.reminderTime}
                onChange={(e) => setFormData({...formData, reminderTime: e.target.value})}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
                Notify
              </label>
              <select
                value={formData.notifyOffset}
                onChange={(e) => setFormData({...formData, notifyOffset: e.target.value as ReminderNotifyOffset})}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
              >
                {NOTIFY_OFFSET_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
                Repeat
              </label>
              <select
                value={formData.repeat}
                onChange={(e) => setFormData({...formData, repeat: e.target.value as ReminderRepeat})}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
              >
                {REPEATS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          <div className="rounded-lg border border-dashed border-blue-200 dark:border-blue-900/50 bg-blue-50/60 dark:bg-blue-950/20 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300 mb-1.5">
              <Bell size={12} />
              Reminder Preview
            </p>
            {preview ? (
              <>
                <p className="text-xs text-slate-500 dark:text-slate-400">Notification will be sent:</p>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                  {preview.date} <span className="text-slate-400 dark:text-slate-600 mx-1">·</span> {preview.time}
                </p>
              </>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">Set a due date and time to preview.</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
              Description (Optional)
            </label>
            <textarea
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all dark:text-white resize-none custom-scrollbar"
              placeholder="Add more details here..."
            />
          </div>
        </form>
      </div>

      <div className="sticky bottom-0 z-20 p-4 border-t border-slate-200 dark:border-slate-800 shrink-0 bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur-md shadow-[0_-4px_12px_rgba(0,0,0,0.06)] flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors border border-slate-200 dark:border-slate-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          form="reminder-form"
          className="px-5 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg transition-all flex items-center gap-2 shadow-sm hover:shadow active:scale-[0.98]"
        >
          <Save size={16} />
          Save Reminder
        </button>
      </div>
    </div>
  );
};
