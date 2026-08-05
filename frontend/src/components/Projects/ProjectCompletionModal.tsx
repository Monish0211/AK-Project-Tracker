import { useState } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";

interface Props {
  isOpen: boolean;
  projectTitle: string;
  prNo: string;
  onConfirm: (data: { actualCompletionDate: string; completionRemarks: string; completedBy: string }) => void;
  onCancel: () => void;
}

export function ProjectCompletionModal({
  isOpen,
  projectTitle,
  prNo,
  onConfirm,
  onCancel,
}: Props) {
  const [actualCompletionDate, setActualCompletionDate] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [completionRemarks, setCompletionRemarks] = useState("");
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!actualCompletionDate) {
      setError("Please select the Actual Completion Date.");
      return;
    }
    if (!completionRemarks.trim() || completionRemarks.trim().length < 20) {
      setError("Completion remarks are required and must be at least 20 characters long.");
      return;
    }

    setError("");
    onConfirm({
      actualCompletionDate,
      completionRemarks: completionRemarks.trim(),
      completedBy: "Administrator",
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border-strong)] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-5 flex items-start justify-between relative">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-300">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <h2 className="text-lg font-black uppercase tracking-tight text-white">
                Complete Project
              </h2>
              <p className="text-xs text-blue-100/80 mt-0.5">
                You are formally marking PR {prNo} ({projectTitle}) as completed.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Actual Completion Date Field */}
          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-[var(--nu-text)] mb-1">
              Actual Completion Date <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="date"
                required
                value={actualCompletionDate}
                onChange={(e) => setActualCompletionDate(e.target.value)}
                className="w-full pl-3 pr-3 py-2 bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-xl text-xs text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)] font-mono"
              />
            </div>
            <p className="text-[10px] text-[var(--nu-text-muted)] mt-1">
              Planned end date will be preserved for baseline variance reporting.
            </p>
          </div>

          {/* Completion Remarks Field */}
          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-[var(--nu-text)] mb-1">
              Completion Remarks <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={4}
              value={completionRemarks}
              onChange={(e) => setCompletionRemarks(e.target.value)}
              placeholder="e.g. Project completed successfully. Final deliverables submitted to client. Client acceptance sign-off received. All invoice cycles settled."
              className="w-full p-3 bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-xl text-xs text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)] resize-none"
            />
            <div className="flex items-center justify-between text-[10px] text-[var(--nu-text-muted)] mt-1">
              <span>Required minimum: 20 characters</span>
              <span className={completionRemarks.length >= 20 ? "text-emerald-600 font-bold" : "text-amber-600"}>
                {completionRemarks.length} / 20 chars
              </span>
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--nu-border)]">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-xl border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] text-[var(--nu-text-muted)] hover:text-[var(--nu-text)] font-bold text-xs transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition cursor-pointer"
            >
              <CheckCircle2 size={16} />
              <span>Mark Project Completed</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
