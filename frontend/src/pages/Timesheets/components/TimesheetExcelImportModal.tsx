import { useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload, X } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { apiClient, ApiError } from "../../../services/apiClient";

/**
 * Backend's ProcessImportResult shape (see Backend/src/modules/timesheets/
 * timesheet.types.ts) — this modal is a thin presentation layer over the
 * EXISTING POST /timesheets/import endpoint, which already runs every
 * uploaded file through the exact same reconciliation/duplicate-detection
 * engine Keka's own daily email import uses (processTimesheetImport()).
 * Nothing here re-implements or duplicates that logic.
 */
interface ImportResult {
  importId: string;
  status: "Pending" | "Processing" | "Succeeded" | "PartiallySucceeded" | "Failed";
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  duplicateCount: number;
  removedCount: number;
  failedCount: number;
  errorSummary: string | null;
  invalidRows: { rowNumber: number; reason: string }[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called once after a successful (or partially successful) import so the caller can re-sync from the backend and refresh the visible table. */
  onImported: () => void;
}

export const TimesheetExcelImportModal = ({ open, onClose, onImported }: Props) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const reset = () => {
    setFile(null);
    setResult(null);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const data = await apiClient.postFormData<ImportResult>("/timesheets/import", formData);
      setResult(data);
      onImported();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to import the Excel file. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        <div className="shrink-0 p-5 border-b border-[var(--nu-border)] flex items-start gap-3">
          <div className="w-10 h-10 rounded-[var(--nu-radius-md)] bg-[var(--nu-accent-soft)] text-[var(--nu-accent)] flex items-center justify-center shrink-0">
            <Upload size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-[var(--nu-text)]">Upload Timesheet Excel</h2>
            <p className="text-[12.5px] text-[var(--nu-text-secondary)] mt-1">
              Follows the exact same matching, reconciliation, and duplicate-detection rules as the daily KEKA import — a
              row already recorded (from KEKA or a prior Excel upload) is safely skipped, never duplicated.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-[var(--nu-radius-md)] flex items-center justify-center text-[var(--nu-text-muted)] hover:bg-[var(--nu-surface-alt)] shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          {!result && (
            <>
              <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[var(--nu-border)] rounded-[var(--nu-radius-md)] py-8 cursor-pointer hover:border-[var(--nu-accent)] hover:bg-[var(--nu-accent-soft)]/30 transition-colors">
                <FileSpreadsheet size={24} className="text-[var(--nu-text-muted)]" />
                <span className="text-[12.5px] font-medium text-[var(--nu-text)]">
                  {file ? file.name : "Click to select an Excel file (.xlsx / .xls)"}
                </span>
                {!file && <span className="text-[11px] text-[var(--nu-text-muted)]">Same KEKA-style column layout used for the daily import</span>}
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setError(null);
                  }}
                />
              </label>

              {error && (
                <div className="bg-[var(--nu-danger-soft)] border border-[var(--nu-danger)]/20 rounded-[var(--nu-radius-md)] p-3 flex items-start gap-2">
                  <AlertTriangle size={14} className="text-[var(--nu-danger)] shrink-0 mt-0.5" />
                  <p className="text-[12px] text-[var(--nu-danger)] font-medium">{error}</p>
                </div>
              )}
            </>
          )}

          {result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {result.status === "Failed" ? (
                  <AlertTriangle size={16} className="text-[var(--nu-danger)]" />
                ) : (
                  <CheckCircle2 size={16} className="text-[var(--nu-success)]" />
                )}
                <p className="text-[13px] font-semibold text-[var(--nu-text)]">
                  Import {result.status === "Succeeded" ? "completed" : result.status === "Failed" ? "failed" : "partially completed"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <ResultStat label="Total Rows" value={result.totalRows} />
                <ResultStat label="Created" value={result.createdCount} tone="success" />
                <ResultStat label="Updated" value={result.updatedCount} tone="info" />
                <ResultStat label="Duplicates Skipped" value={result.duplicateCount} tone="neutral" />
                <ResultStat label="Removed (0 hrs)" value={result.removedCount} tone="neutral" />
                <ResultStat label="Invalid Rows" value={result.invalidRows.length} tone={result.invalidRows.length > 0 ? "danger" : "neutral"} />
              </div>

              {result.errorSummary && (
                <div className="bg-[var(--nu-danger-soft)] border border-[var(--nu-danger)]/20 rounded-[var(--nu-radius-md)] p-3">
                  <p className="text-[12px] text-[var(--nu-danger)] font-medium">{result.errorSummary}</p>
                </div>
              )}

              {result.invalidRows.length > 0 && (
                <div className="border border-[var(--nu-border)] rounded-[var(--nu-radius-md)] max-h-40 overflow-y-auto">
                  <table className="w-full text-[11.5px]">
                    <thead className="sticky top-0 bg-[var(--nu-surface-alt)]">
                      <tr>
                        <th className="px-2.5 py-1.5 text-left font-medium text-[var(--nu-text-muted)] w-16">Row</th>
                        <th className="px-2.5 py-1.5 text-left font-medium text-[var(--nu-text-muted)]">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.invalidRows.map((row) => (
                        <tr key={row.rowNumber} className="border-t border-[var(--nu-border)]">
                          <td className="px-2.5 py-1.5 text-[var(--nu-text)]">{row.rowNumber}</td>
                          <td className="px-2.5 py-1.5 text-[var(--nu-text-secondary)]">{row.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 p-4 border-t border-[var(--nu-border)] flex items-center justify-end gap-2.5">
          {result ? (
            <Button variant="primary" size="sm" onClick={handleClose}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={handleClose} disabled={uploading}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleUpload} disabled={!file || uploading} icon={<Upload size={13} />}>
                {uploading ? "Importing..." : "Import"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

function ResultStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "success" | "info" | "danger" | "neutral";
}) {
  const toneClass =
    tone === "success"
      ? "text-[var(--nu-success)]"
      : tone === "info"
        ? "text-[var(--nu-accent)]"
        : tone === "danger"
          ? "text-[var(--nu-danger)]"
          : "text-[var(--nu-text)]";
  return (
    <div className="rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-3 py-2">
      <p className="text-[10.5px] uppercase tracking-wide text-[var(--nu-text-muted)]">{label}</p>
      <p className={`text-[16px] font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
