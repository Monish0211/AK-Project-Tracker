import { useState } from "react";
import { AlertTriangle, History, X } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { apiClient, ApiError } from "../../../services/apiClient";

interface ClearResult {
  deletedCount: number;
  recomputedPairCount: number;
  startDate: string;
  endDate: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called once after a successful clear so the caller can re-sync from the backend and refresh the visible table. */
  onCleared: () => void;
}

/** "Yesterday" computed live against the real current date every time this opens — never a hardcoded/assumed date. */
function yesterdayDateInputValue(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Administrator-only historical-backfill clear — deliberately a SEPARATE
 * action from the Excel upload modal, with its own explicit confirmation
 * step, per design: selecting an Excel file must never, by itself, delete
 * anything. Calls DELETE /timesheets/entries/historical, which only removes
 * TimesheetEntry rows whose workDate falls inside [startDate, endDate];
 * every Project/Employee/Invoice/Expense/Milestone/Notification/AuditLog
 * record, and all TimesheetImport/TimesheetImportRowLog audit history, are
 * untouched (see Backend/src/modules/timesheets/services/timesheet.service.ts's
 * clearHistoricalTimesheetEntries()).
 *
 * There is no configured or derivable "KEKA implementation start date"
 * anywhere in the codebase (confirmed by inspection) — startDate is
 * therefore always a deliberate, explicit Administrator input here, never
 * guessed or hardcoded.
 */
export const TimesheetHistoricalResetModal = ({ open, onClose, onCleared }: Props) => {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState(yesterdayDateInputValue());
  const [confirmText, setConfirmText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClearResult | null>(null);

  if (!open) return null;

  const reset = () => {
    setStartDate("");
    setEndDate(yesterdayDateInputValue());
    setConfirmText("");
    setError(null);
    setResult(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const canConfirm = startDate !== "" && endDate !== "" && confirmText.trim().toUpperCase() === "CLEAR" && !pending;

  const handleClear = async () => {
    if (!canConfirm) return;
    setPending(true);
    setError(null);
    try {
      const data = await apiClient.delete<ClearResult>(
        `/timesheets/entries/historical?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
      );
      setResult(data);
      onCleared();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to clear the historical timesheet data. Please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
        <div className="shrink-0 p-5 border-b border-[var(--nu-border)] flex items-start gap-3">
          <div className="w-10 h-10 rounded-[var(--nu-radius-md)] bg-[var(--nu-danger-soft)] text-[var(--nu-danger)] flex items-center justify-center shrink-0">
            <History size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-[var(--nu-text)]">Historical Timesheet Reset</h2>
            <p className="text-[12.5px] text-[var(--nu-text-secondary)] mt-1">Administrator only. Removes existing timesheet records for a chosen date range.</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-[var(--nu-radius-md)] flex items-center justify-center text-[var(--nu-text-muted)] hover:bg-[var(--nu-surface-alt)] shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {result ? (
            <div className="bg-[var(--nu-success-soft)] border border-[var(--nu-success)]/20 rounded-[var(--nu-radius-md)] p-3">
              <p className="text-[12.5px] font-medium text-[var(--nu-text)]">
                Deleted {result.deletedCount} timesheet entr{result.deletedCount === 1 ? "y" : "ies"} between{" "}
                {result.startDate.slice(0, 10)} and {result.endDate.slice(0, 10)}. You can now import the historical Excel
                data for this period.
              </p>
            </div>
          ) : (
            <>
              <div className="bg-[var(--nu-danger-soft)] border border-[var(--nu-danger)]/20 rounded-[var(--nu-radius-md)] p-3 flex items-start gap-2">
                <AlertTriangle size={14} className="text-[var(--nu-danger)] shrink-0 mt-0.5" />
                <p className="text-[12px] text-[var(--nu-danger)] font-medium">
                  This will remove existing timesheet records for the selected historical period before importing the
                  Excel data. This does not affect Employees, Projects, Invoices, Expenses, Milestones, or any other
                  data — only Timesheet Entries in this exact date range. This cannot be undone.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[var(--nu-text-secondary)] mb-1">Start Date</label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 text-[12.5px]" />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[var(--nu-text-secondary)] mb-1">End Date</label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} max={yesterdayDateInputValue()} className="h-9 text-[12.5px]" />
                </div>
              </div>
              <p className="text-[11px] text-[var(--nu-text-muted)]">
                End date cannot be later than yesterday — this is a historical-only operation.
              </p>

              <div>
                <label className="block text-[11px] font-medium text-[var(--nu-text-secondary)] mb-1">
                  Type <span className="font-semibold text-[var(--nu-text)]">CLEAR</span> to confirm
                </label>
                <Input type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="h-9 text-[12.5px]" placeholder="CLEAR" />
              </div>

              {error && (
                <div className="bg-[var(--nu-danger-soft)] border border-[var(--nu-danger)]/20 rounded-[var(--nu-radius-md)] p-3">
                  <p className="text-[12px] text-[var(--nu-danger)] font-medium">{error}</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="shrink-0 p-4 border-t border-[var(--nu-border)] flex items-center justify-end gap-2.5">
          {result ? (
            <Button variant="primary" size="sm" onClick={handleClose}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={handleClose} disabled={pending}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={handleClear} disabled={!canConfirm}>
                {pending ? "Clearing..." : "Clear Historical Data"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
