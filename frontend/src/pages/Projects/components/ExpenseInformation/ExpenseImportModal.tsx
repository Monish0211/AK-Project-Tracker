import { useRef, useState } from "react";
import {
  X,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  RefreshCw,
} from "lucide-react";
import { previewExpenseImport, commitExpenseImport } from "../../../../services/expenseImportService";
import type { ImportRunResultDto, SheetImportResultDto } from "../../../../services/expenseImportService";
import { usePmoToast } from "../../../../components/ui/usePmoToast";

interface Props {
  onClose: () => void;
}

type Stage = "select" | "previewing" | "preview" | "importing" | "done";

const formatINR = (value: number): string => `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** Excel Import (Sept 2026) — Other Project Expenses. Select -> preview (parses + classifies, never writes) -> optional per-PR manual-expense confirmation -> commit -> result. Every sheet's outcome is shown distinctly (never silently hidden), per the approved design. */
const ExpenseImportModal = ({ onClose }: Props) => {
  const { showToast } = usePmoToast();
  const [stage, setStage] = useState<Stage>("select");
  const [file, setFile] = useState<File | null>(null);
  const [previewResult, setPreviewResult] = useState<ImportRunResultDto | null>(null);
  const [finalResult, setFinalResult] = useState<ImportRunResultDto | null>(null);
  const [confirmedProjectIds, setConfirmedProjectIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Finding 4 — a plain ref, not state: refs update synchronously, so two
  // near-simultaneous clicks (both firing before React re-renders/disables
  // the button) still see the second one set the flag true first and bail
  // out. Relying on `stage`/`isSubmitting` state alone would not close this
  // gap, since state updates only apply on the next render.
  const isSubmittingRef = useRef(false);

  const handleFileSelected = async (selected: File) => {
    setFile(selected);
    setError(null);
    setStage("previewing");
    try {
      const result = await previewExpenseImport(selected);
      setPreviewResult(result);
      setStage("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse the uploaded file.");
      setStage("select");
    }
  };

  const toggleConfirmed = (projectId: string) => {
    setConfirmedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const handleConfirmImport = async () => {
    if (!file) return;
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setStage("importing");
    setError(null);
    try {
      const result = await commitExpenseImport(file, Array.from(confirmedProjectIds));
      setFinalResult(result);
      setStage("done");
      if (result.status === "Succeeded" || result.status === "PartiallySucceeded") {
        showToast({ type: "success", message: `Import complete — ${result.totalRowsImported} expense row(s) imported.` });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed. Please try again.");
      setStage("preview");
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const renderSheetBadge = (sheet: SheetImportResultDto) => {
    switch (sheet.changeStatus) {
      case "newImport":
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-full px-2.5 py-1">
            <CheckCircle2 size={13} /> Ready to import
          </span>
        );
      case "changedWillSupersede":
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-50 rounded-full px-2.5 py-1">
            <RefreshCw size={13} /> Changed — will replace previous imported version
          </span>
        );
      case "unchangedSkipped":
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-100 rounded-full px-2.5 py-1">
            <Info size={13} /> Already imported / same data — no changes
          </span>
        );
      case "unmatchedPr":
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 rounded-full px-2.5 py-1">
            <XCircle size={13} /> Unmatched PR — nothing will be imported
          </span>
        );
      case "noImportableRows":
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-100 rounded-full px-2.5 py-1">
            <Info size={13} /> No importable rows on this sheet
          </span>
        );
      case "awaitingManualConfirmation":
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 rounded-full px-2.5 py-1">
            <AlertTriangle size={13} /> Existing manual expenses — confirmation required
          </span>
        );
      case "invalidFormat":
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 rounded-full px-2.5 py-1">
            <XCircle size={13} /> Unrecognized sheet format — nothing could be read
          </span>
        );
      default:
        return null;
    }
  };

  const renderSheet = (sheet: SheetImportResultDto) => (
    <div key={sheet.sheetName} className="border border-slate-200 rounded-xl p-4 space-y-2.5 bg-white">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="font-bold text-slate-800">{sheet.sheetName}</p>
          <p className="text-xs text-slate-500">
            {sheet.matchedPrNo ? `Matched Project: ${sheet.matchedPrNo}` : sheet.unmatchedReason ?? "Not matched"}
          </p>
        </div>
        {renderSheetBadge(sheet)}
      </div>

      {sheet.rowsImportable.length > 0 && (
        <p className="text-sm text-slate-700">
          <strong>{sheet.rowsImportable.length}</strong> row(s) importable — Debit-only total{" "}
          <strong>{formatINR(sheet.computedDebitOnlyTotal)}</strong>
          {sheet.previousActiveImportedTotal !== undefined && (
            <> (previous active imported total: {formatINR(sheet.previousActiveImportedTotal)})</>
          )}
        </p>
      )}

      {sheet.rowsImportable.some((r) => r.anomaly) && (
        <div className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2">
          <AlertTriangle size={12} className="inline mr-1" />
          {sheet.rowsImportable.filter((r) => r.anomaly).length} row(s) had both Debit and Credit populated — Debit was used, Credit ignored.
        </div>
      )}

      {sheet.rowsSkippedCreditOnly.length > 0 && (
        <div className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2">
          {sheet.rowsSkippedCreditOnly.length} Credit-only row(s) skipped (never used as a fallback): {" "}
          {sheet.rowsSkippedCreditOnly.map((r) => `${r.particulars} (${formatINR(r.creditAmount)})`).join(", ")}
        </div>
      )}

      {sheet.rowsSkippedNonNumericDebit.length > 0 && (
        <div className="text-xs text-red-700 bg-red-50 rounded-lg p-2">
          Data-quality warning — {sheet.rowsSkippedNonNumericDebit.length} row(s) had non-numeric Debit values: {" "}
          {sheet.rowsSkippedNonNumericDebit.map((r) => `${r.particulars} ("${r.rawDebit}")`).join(", ")}
        </div>
      )}

      {sheet.rowsPendingCategoryDecision.length > 0 && (
        <div className="text-xs text-orange-700 bg-orange-50 rounded-lg p-2">
          <AlertTriangle size={12} className="inline mr-1" />
          {sheet.rowsPendingCategoryDecision.length} row(s) use a Particulars value pending a business decision on
          category mapping — NOT imported: {" "}
          {sheet.rowsPendingCategoryDecision.map((r) => `${r.particulars} (${formatINR(r.amount)})`).join(", ")}
        </div>
      )}

      {sheet.existingManualExpenses.length > 0 && (
        <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
          <p className="font-semibold text-amber-800">
            Existing Other Project Expenses were found for {sheet.matchedPrNo}. Would you like to import the expenses
            from this Excel?
          </p>
          <ul className="text-amber-700 space-y-0.5">
            {sheet.existingManualExpenses.map((e) => (
              <li key={e.id}>
                {e.category} — {e.description} — {formatINR(e.totalCost)}
              </li>
            ))}
          </ul>
          {(sheet.changeStatus === "awaitingManualConfirmation" ||
            (sheet.matchedProjectId && confirmedProjectIds.has(sheet.matchedProjectId))) &&
            sheet.matchedProjectId && (
              <label className="flex items-center gap-2 font-semibold text-amber-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmedProjectIds.has(sheet.matchedProjectId)}
                  onChange={() => toggleConfirmed(sheet.matchedProjectId!)}
                />
                Yes, proceed with importing the Excel expenses for this PR anyway
              </label>
            )}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden">
        <div className="flex justify-between items-center border-b px-6 py-5 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <FileSpreadsheet size={20} className="text-emerald-600" />
              Import Other Project Expenses from Excel
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Upload a workbook with one sheet per PR. Only the Debit column is imported — Credit is never used.
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 flex-1 min-h-0 overflow-y-auto space-y-4">
          {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3">{error}</div>}

          {stage === "select" && (
            <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-slate-300 rounded-2xl p-12 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition">
              <UploadCloud size={36} className="text-slate-400" />
              <span className="text-sm font-semibold text-slate-600">Click to select an .xlsx file</span>
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => {
                  const selected = e.target.files?.[0];
                  if (selected) void handleFileSelected(selected);
                }}
              />
            </label>
          )}

          {stage === "previewing" && <p className="text-center text-slate-500 py-12">Parsing workbook…</p>}

          {stage === "preview" && previewResult && (
            <>
              {previewResult.status === "RejectedDuplicate" && (
                <div className="bg-slate-100 text-slate-700 text-sm rounded-lg p-4 font-semibold">
                  This Excel file was already imported on{" "}
                  {previewResult.rejectedDuplicateUploadedAt
                    ? new Date(previewResult.rejectedDuplicateUploadedAt).toLocaleString("en-IN")
                    : "an earlier date"}{" "}
                  as Batch #{previewResult.rejectedDuplicateOfBatchId?.slice(0, 8)}. No changes were made.
                </div>
              )}
              {previewResult.status !== "RejectedDuplicate" && (
                <>
                  <div className="text-sm text-slate-600">
                    {previewResult.totalSheetsFound} sheet(s) found · {previewResult.totalRowsFound} transaction row(s)
                    total.
                  </div>
                  {previewResult.sheets.map(renderSheet)}
                </>
              )}
            </>
          )}

          {stage === "importing" && <p className="text-center text-slate-500 py-12">Importing…</p>}

          {stage === "done" && finalResult && (
            <>
              <div className="bg-emerald-50 text-emerald-800 text-sm rounded-lg p-4 font-semibold">
                Import {finalResult.status === "Failed" ? "failed" : "complete"} — {finalResult.totalRowsImported}{" "}
                row(s) imported, {finalResult.totalRowsSkipped} row(s) skipped.
                {finalResult.batchId && <> Batch #{finalResult.batchId.slice(0, 8)}.</>}
              </div>
              {finalResult.sheets.map(renderSheet)}
            </>
          )}
        </div>

        <div className="border-t px-6 py-4 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="border rounded-xl px-5 py-2.5 text-slate-700 hover:bg-gray-100 font-medium">
            {stage === "done" ? "Close" : "Cancel"}
          </button>
          {stage === "preview" && previewResult && previewResult.status !== "RejectedDuplicate" && (
            <button
              onClick={handleConfirmImport}
              disabled={isSubmitting}
              className="bg-emerald-600 text-white rounded-xl px-5 py-2.5 hover:bg-emerald-700 font-bold disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Confirm Import
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExpenseImportModal;
