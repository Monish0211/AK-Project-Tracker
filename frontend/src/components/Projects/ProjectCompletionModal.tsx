import { useState } from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Scale, X } from "lucide-react";
import { DATE_INPUT_MAX, DATE_INPUT_MIN, dateInputError } from "../../utils/dateInputValidation";
import { formatIndianCurrency } from "../../utils/formatCurrency";
import { isLdRecorded, LD_REMARKS_MAX, parseLdAmountInput } from "../../utils/liquidatedDamages";
import type { LdRecord } from "../../utils/liquidatedDamages";

/** The LD decision captured by this popup (null when LD was already recorded earlier and is kept unchanged). */
export interface CompletionLd {
  ldApplicable: boolean;
  ldAmountINR: number | null;
  ldRemarks: string | null;
}

interface Props {
  isOpen: boolean;
  projectTitle: string;
  prNo: string;
  /** LD recorded at an earlier completion (project since reopened) — shown read-only, never asked again. */
  recordedLd?: LdRecord | null;
  /** Profit Before LD (WO − expenses) and WO value, only for the non-blocking "LD exceeds …" warning. */
  profitBeforeLd?: number | null;
  workOrderValueINR?: number | null;
  onConfirm: (data: { actualCompletionDate: string; completionRemarks: string; completedBy: string; ld: CompletionLd | null }) => void;
  onCancel: () => void;
}

export function ProjectCompletionModal({
  isOpen,
  projectTitle,
  prNo,
  recordedLd = null,
  profitBeforeLd = null,
  workOrderValueINR = null,
  onConfirm,
  onCancel,
}: Props) {
  const [actualCompletionDate, setActualCompletionDate] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [completionRemarks, setCompletionRemarks] = useState("");
  const [error, setError] = useState("");
  // Liquidated Damages (Oct 2026) — explicit decision, default No; never derived from dates.
  const [ldApplicable, setLdApplicable] = useState(false);
  const [ldAmountText, setLdAmountText] = useState("");
  const [ldRemarks, setLdRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // A fresh opening never inherits a previous attempt's "submitting" lock
  // (state adjusted during render on the isOpen change, not in an effect).
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setSubmitting(false);
  }

  if (!isOpen) return null;

  const ldAlreadyRecorded = recordedLd !== null && isLdRecorded(recordedLd.ldApplicable);
  const parsedAmount = ldApplicable ? parseLdAmountInput(ldAmountText) : null;
  const amount = parsedAmount && parsedAmount.error === null ? parsedAmount.value : null;
  const warnings: string[] = [];
  if (amount !== null && typeof profitBeforeLd === "number" && amount > profitBeforeLd) {
    warnings.push(`LD exceeds the project's Profit Before LD (${formatIndianCurrency(profitBeforeLd)}) — Final Profit After LD will be negative.`);
  }
  if (amount !== null && typeof workOrderValueINR === "number" && workOrderValueINR > 0 && amount > workOrderValueINR) {
    warnings.push(`LD exceeds the Work Order Value (${formatIndianCurrency(workOrderValueINR)}).`);
  }

  const confirmLabel = ldAlreadyRecorded
    ? "Mark Project Completed"
    : !ldApplicable
      ? "Mark Completed (No LD)"
      : amount !== null
        ? `Mark Completed with LD ${formatIndianCurrency(amount)}`
        : "Mark Completed with LD";

  const chooseLd = (value: boolean) => {
    setLdApplicable(value);
    if (!value) setLdAmountText(""); // switching to No clears the amount
    setError("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!actualCompletionDate) {
      setError("Please select the Actual Completion Date.");
      return;
    }
    const dateError = dateInputError("Actual Completion Date", actualCompletionDate);
    if (dateError) {
      setError(dateError);
      return;
    }
    if (!completionRemarks.trim() || completionRemarks.trim().length < 20) {
      setError("Completion remarks are required and must be at least 20 characters long.");
      return;
    }

    let ld: CompletionLd | null = null;
    if (!ldAlreadyRecorded) {
      if (ldApplicable) {
        const parsed = parseLdAmountInput(ldAmountText);
        if (parsed.error !== null) {
          setError(parsed.error);
          return;
        }
        if (ldRemarks.trim().length > LD_REMARKS_MAX) {
          setError(`LD Reference / Remarks can be at most ${LD_REMARKS_MAX} characters.`);
          return;
        }
        ld = { ldApplicable: true, ldAmountINR: parsed.value, ldRemarks: ldRemarks.trim() || null };
      } else {
        ld = { ldApplicable: false, ldAmountINR: null, ldRemarks: ldRemarks.trim() || null };
      }
    }

    setError("");
    setSubmitting(true); // one confirmation per opening — a double click cannot submit twice
    onConfirm({
      actualCompletionDate,
      completionRemarks: completionRemarks.trim(),
      completedBy: "Administrator",
      ld,
    });
  };

  const radioClass = (active: boolean) =>
    `flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition ${
      active
        ? "border-[var(--nu-accent)] bg-[var(--nu-accent)]/10 text-[var(--nu-text)]"
        : "border-[var(--nu-border)] bg-[var(--nu-surface-alt)] text-[var(--nu-text-muted)] hover:text-[var(--nu-text)]"
    }`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border-strong)] rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col">
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
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs overflow-y-auto">
          {error && (
            <div role="alert" className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 flex items-center gap-2">
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
                min={DATE_INPUT_MIN}
                max={DATE_INPUT_MAX}
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

          {/* Liquidated Damages (LD) */}
          <fieldset className="rounded-xl border border-[var(--nu-border)] p-3.5 space-y-3">
            <legend className="px-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[var(--nu-text)] inline-flex items-center gap-1.5">
              <Scale size={13} /> Liquidated Damages (LD)
            </legend>

            {ldAlreadyRecorded ? (
              <p className="text-[11px] text-[var(--nu-text-muted)]">
                LD was recorded when this project was first completed and is kept unchanged:{" "}
                <strong className="text-[var(--nu-text)]">
                  {recordedLd!.ldApplicable ? `Yes — ${formatIndianCurrency(recordedLd!.ldAmountINR ?? 0)}` : "No"}
                </strong>
                .
              </p>
            ) : (
              <>
                <div>
                  <span id="ld-applicable-label" className="block text-[11px] font-bold text-[var(--nu-text)] mb-1.5">
                    Is LD applicable? <span className="text-rose-500">*</span>
                  </span>
                  <div role="radiogroup" aria-labelledby="ld-applicable-label" className="flex gap-2">
                    <label className={radioClass(!ldApplicable)}>
                      <input type="radio" name="ldApplicable" value="no" checked={!ldApplicable} onChange={() => chooseLd(false)} className="sr-only" />
                      No
                    </label>
                    <label className={radioClass(ldApplicable)}>
                      <input type="radio" name="ldApplicable" value="yes" checked={ldApplicable} onChange={() => chooseLd(true)} className="sr-only" />
                      Yes
                    </label>
                  </div>
                </div>

                {ldApplicable && (
                  <div>
                    <label htmlFor="ld-amount" className="block text-[11px] font-bold text-[var(--nu-text)] mb-1">
                      LD Amount (₹) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="ld-amount"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={ldAmountText}
                      onChange={(e) => {
                        setLdAmountText(e.target.value);
                        setError("");
                      }}
                      placeholder="e.g. 50000.00"
                      aria-invalid={ldAmountText !== "" && parsedAmount?.error ? true : undefined}
                      className="w-full pl-3 pr-3 py-2 bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-xl text-xs text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)] font-mono"
                    />
                    {ldAmountText !== "" && parsedAmount?.error && <p className="text-[10px] text-rose-600 mt-1">{parsedAmount.error}</p>}
                    <p className="text-[10px] text-[var(--nu-text-muted)] mt-1">
                      Entered by you as agreed with the client — never calculated from dates. Deducted from profit only; invoices and collections are unaffected.
                    </p>
                  </div>
                )}

                <div>
                  <label htmlFor="ld-remarks" className="block text-[11px] font-bold text-[var(--nu-text)] mb-1">
                    LD Reference / Remarks <span className="font-normal text-[var(--nu-text-muted)]">(optional)</span>
                  </label>
                  <input
                    id="ld-remarks"
                    type="text"
                    maxLength={LD_REMARKS_MAX}
                    value={ldRemarks}
                    onChange={(e) => setLdRemarks(e.target.value)}
                    placeholder="e.g. Contract clause / client letter reference"
                    className="w-full pl-3 pr-3 py-2 bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-xl text-xs text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
                  />
                </div>

                {warnings.map((w) => (
                  <div key={w} role="note" className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300 flex items-start gap-2 text-[11px]">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </div>
                ))}
                <p className="text-[10px] text-[var(--nu-text-muted)]">LD is recorded once at completion and cannot be edited afterwards.</p>
              </>
            )}
          </fieldset>

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
              disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 size={16} />
              <span>{confirmLabel}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
