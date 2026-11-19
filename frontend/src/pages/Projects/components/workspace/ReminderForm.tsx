import React, { useState, useEffect } from "react";
import { X, Save, Bell, Globe2 } from "lucide-react";
import type {
  ProjectReminder,
  ReminderPriority,
  ReminderNotifyOffset,
  ReminderRepeat,
  ReminderStatus
} from "../../../../types/ProjectReminder";
import { NOTIFY_OFFSET_OPTIONS } from "../../../../types/ProjectReminder";
import { getReminderPreview } from "../../../../utils/reminderDisplay";
import { localTimeIssue, zonedToday, zoneLabel } from "../../../../utils/projectTimeZone";
import { Button } from "../../../../components/ui/Button";
import { Input } from "../../../../components/ui/Input";
import { Select } from "../../../../components/ui/Select";
import { Textarea } from "../../../../components/ui/Textarea";
import { FieldError } from "../../../../components/ui/FieldError";
import { dateInputError } from "../../../../utils/dateInputValidation";

interface Props {
  reminder?: ProjectReminder | null;
  projectId: string;
  projectCode: string;
  /** The project country's IANA zone (from the server); null = the project has no country; undefined = not known yet. Dates and times are entered in it. */
  timeZone?: string | null;
  country?: string | null;
  onSave: (reminderData: Partial<ProjectReminder>) => void;
  onCancel: () => void;
}

const REMINDER_TYPES = [
  "Invoice", "Client Meeting", "Payment Follow-up", "Budget Review", 
  "Document Submission", "Deliverable", "Timesheet", "Contract", "Milestone", "Custom"
];

const PRIORITIES: ReminderPriority[] = ["Critical", "High", "Medium", "Low"];
const REPEATS: ReminderRepeat[] = ["None", "Daily", "Weekly", "Monthly", "Yearly"];

export const ReminderForm: React.FC<Props> = ({ reminder, projectId, projectCode, timeZone, country, onSave, onCancel }) => {
  // An existing reminder keeps the zone it was saved in; a new one uses the project's.
  const zone = reminder ? (reminder.timeZone ?? (reminder.dueAt ? null : timeZone ?? null)) : (timeZone ?? null);
  const zoneCountry = reminder?.country ?? country ?? null;
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    reminderType: "Invoice",
    priority: "Medium" as ReminderPriority,
    status: "Pending" as ReminderStatus,
    // Today in the PROJECT's calendar (not the viewer's, and not UTC).
    reminderDate: timeZone ? zonedToday(timeZone) : new Date().toISOString().split("T")[0],
    reminderTime: "09:00",
    notifyOffset: "10 Minutes Before" as ReminderNotifyOffset,
    repeat: "None" as ReminderRepeat,
  });

  const [dateError, setDateError] = useState<string | undefined>(undefined);

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
    const reminderDateError = dateInputError("Due Date", formData.reminderDate);
    if (reminderDateError) {
      setDateError(reminderDateError);
      return;
    }
    // Same daylight-saving policy as the server: a local time skipped by a clock change is refused, never silently moved.
    if (zone && localTimeIssue(formData.reminderDate, formData.reminderTime, zone) === "nonexistent") {
      setDateError(`${formData.reminderTime} does not exist on this date in ${zoneLabel(zone, zoneCountry)} (daylight-saving change). Choose another time.`);
      return;
    }

    onSave({
      ...formData,
      projectId,
      projectCode,
      createdBy: reminder?.createdBy || "Administrator", // Hardcoded for now per PMO standard
    });
  };

  const preview = getReminderPreview(formData.reminderDate, formData.reminderTime, formData.notifyOffset, zone);
  const legacyReminder = !!reminder && !reminder.timeZone && !reminder.dueAt;
  // One short line above the date and time saying which clock they are in (nothing when it is not known yet).
  const zoneNote = zone
    ? `Times are in ${zoneLabel(zone, zoneCountry)} (${zone}), the project's country.`
    : legacyReminder && timeZone
      ? `Saved before project time zones: keeps its original time. A new date or time is saved in ${zoneLabel(timeZone, country)}.`
      : timeZone === null
        ? "This project has no country: times use your device's time zone."
        : "";

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

      <div className="overflow-y-auto p-4 custom-scrollbar flex-1 min-h-0">
        <form id="reminder-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
              Reminder Title *
            </label>
            <Input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
              placeholder="e.g. Submit July Invoice"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
                Type
              </label>
              <Select
                value={formData.reminderType}
                onChange={(e) => setFormData({...formData, reminderType: e.target.value})}
              >
                {REMINDER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
            </div>
            
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
                Priority
              </label>
              <Select
                value={formData.priority}
                onChange={(e) => setFormData({...formData, priority: e.target.value as ReminderPriority})}
              >
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </Select>
            </div>
          </div>

          {zoneNote && (
            <div
              className="flex items-start gap-2 rounded-lg border border-blue-100 dark:border-blue-900/50 bg-blue-50/70 dark:bg-blue-950/20 px-3 py-2 text-[11.5px] leading-snug text-slate-600 dark:text-slate-300"
              data-testid="reminder-time-zone"
            >
              <Globe2 size={14} className="mt-px shrink-0 text-blue-600 dark:text-blue-400" />
              <span>{zoneNote}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
                Due Date *
              </label>
              <Input
                type="date"
                required
                value={formData.reminderDate}
                onChange={(e) => {
                  setFormData({...formData, reminderDate: e.target.value});
                  setDateError(undefined);
                }}
                invalid={!!dateError}
              />
              <FieldError error={dateError} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
                Time
              </label>
              <Input
                type="time"
                value={formData.reminderTime}
                onChange={(e) => setFormData({...formData, reminderTime: e.target.value})}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
                Notify
              </label>
              <Select
                value={formData.notifyOffset}
                onChange={(e) => setFormData({...formData, notifyOffset: e.target.value as ReminderNotifyOffset})}
              >
                {NOTIFY_OFFSET_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
              </Select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
                Repeat
              </label>
              <Select
                value={formData.repeat}
                onChange={(e) => setFormData({...formData, repeat: e.target.value as ReminderRepeat})}
              >
                {REPEATS.map(r => <option key={r} value={r}>{r}</option>)}
              </Select>
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
            <Textarea
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              className="resize-none custom-scrollbar"
              placeholder="Add more details here..."
            />
          </div>
        </form>
      </div>

      <div className="sticky bottom-0 z-20 p-4 border-t border-slate-200 dark:border-slate-800 shrink-0 bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur-md shadow-[0_-4px_12px_rgba(0,0,0,0.06)] flex items-center justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" form="reminder-form" variant="primary">
          <Save size={16} />
          Save Reminder
        </Button>
      </div>
    </div>
  );
};
