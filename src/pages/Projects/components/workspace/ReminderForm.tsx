import React, { useState, useEffect } from "react";
import { X, Save } from "lucide-react";
import type {
  ProjectReminder,
  ReminderPriority,
  ReminderNotifyOffset,
  ReminderRepeat,
  ReminderStatus
} from "../../../../types/ProjectReminder";
import { NOTIFY_OFFSET_OPTIONS } from "../../../../types/ProjectReminder";

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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          {reminder ? "Edit Reminder" : "New Reminder"}
        </h3>
        <button onClick={onCancel} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md transition-colors">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
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

      <div className="p-4 border-t border-slate-200 dark:border-slate-800 shrink-0 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          form="reminder-form"
          className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg transition-colors flex items-center gap-2 shadow-sm"
        >
          <Save size={16} />
          {reminder ? "Save Changes" : "Create Reminder"}
        </button>
      </div>
    </div>
  );
};
