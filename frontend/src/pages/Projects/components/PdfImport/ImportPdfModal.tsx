import { useState } from "react";
import { AlertCircle, CheckCircle2, ChevronLeft, FileUp, Loader2, RotateCcw, Sparkles, XCircle, X } from "lucide-react";
import type { Project } from "../../../../types/Project";
import type { PdfImportWarning } from "../../../../types/PdfImport";
import type { PdfUploadStage } from "../../../../types/PdfImport";
import {
  extractPdfFilesSequentially,
  type PdfBatchFileResult,
  type PdfBatchProgressEvent,
} from "../../../../services/pdfImportService";
import { mapPdfImportResponseToProject } from "../../../../utils/pdfImportMapper";
import { validatePdfImportResponse } from "../../../../utils/pdfImportValidator";
import { Button } from "../../../../components/ui/Button";
import { Portal } from "../../../../components/ui/Portal";
import { UploadZone } from "./UploadZone";
import { PdfPreview } from "./PdfPreview";
import { WarningsPanel } from "./WarningsPanel";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onApply: (updatedProject: Project) => void;
}

const STAGE_LABEL: Record<"uploading" | "processing" | "ai-enhancing", string> = {
  uploading: "Reading document…",
  processing: "OCR extraction…",
  "ai-enhancing": "Claude AI verification…",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Owns the whole Upload → Extract → Results → Preview → Apply flow, for one
 * or many PDFs in a single session. Every file is processed independently
 * (see pdfImportService.ts's extractPdfFilesSequentially()) — one bad or
 * Claude-failing file never loses the others. When exactly one file is
 * selected and it succeeds, the "results" list is skipped entirely and the
 * flow goes straight to preview, exactly as it did before multi-file
 * support existed. Never touches Project fields directly:
 * mapPdfImportResponseToProject() (pdfImportMapper.ts) is the only place
 * that happens, and only on Apply.
 */
export const ImportPdfModal = ({ isOpen, onClose, project, onApply }: Props) => {
  const [stage, setStage] = useState<PdfUploadStage>("idle");
  const [batchProgress, setBatchProgress] = useState<PdfBatchProgressEvent | null>(null);
  const [batchResults, setBatchResults] = useState<PdfBatchFileResult[]>([]);
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const [computedWarnings, setComputedWarnings] = useState<PdfImportWarning[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const reset = () => {
    setStage("idle");
    setBatchProgress(null);
    setBatchResults([]);
    setActiveResultId(null);
    setComputedWarnings([]);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const openPreview = (result: PdfBatchFileResult) => {
    if (!result.response) return;
    setActiveResultId(result.id);
    setComputedWarnings(validatePdfImportResponse(result.response));
    setStage("preview");
  };

  const handleExtract = async (files: File[], useClaude: boolean) => {
    setStage("processing");
    setError(null);
    try {
      const results = await extractPdfFilesSequentially(files, useClaude, (event) => setBatchProgress(event));
      setBatchResults(results);

      const firstSuccess = results.find((r) => r.status === "success");
      if (results.length === 1 && firstSuccess) {
        // Single-file happy path — go straight to preview, unchanged from
        // before multi-file support existed.
        openPreview(firstSuccess);
      } else {
        setStage("results");
      }
    } catch (err) {
      // Safety net only — extractPdfFilesSequentially() isolates every
      // per-file failure internally and should not itself throw. If it
      // somehow does, this is the one place that still surfaces a clean
      // error instead of leaving the modal stuck on a spinner.
      setError(err instanceof Error ? err.message : "Failed to process the selected files. Please try again.");
      setStage("error");
    }
  };

  const activeResult = batchResults.find((r) => r.id === activeResultId) ?? null;

  const handleApply = () => {
    if (!activeResult?.response) return;
    const updatedProject = mapPdfImportResponseToProject(activeResult.response, project);
    onApply(updatedProject);
    handleClose();
  };

  const successCount = batchResults.filter((r) => r.status === "success").length;
  const allWarnings = activeResult?.response
    ? [...activeResult.response.warnings, ...computedWarnings]
    : [];

  const overallPercent = batchProgress
    ? Math.round(((batchProgress.fileIndex + batchProgress.percent / 100) / batchProgress.totalFiles) * 100)
    : 0;

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
        <div className="bg-[var(--nu-surface)] border border-[var(--nu-border-strong)] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-5 flex items-start justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-white/10 border border-white/20 text-white">
                <FileUp size={22} />
              </div>
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight text-white">Import Project from PDF</h2>
                <p className="text-xs text-blue-100/80 mt-0.5">
                  Upload one or more Work Order, Purchase Order, Proposal, or Client PDFs to auto-fill this form.
                </p>
              </div>
            </div>
            <button type="button" onClick={handleClose} className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition">
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 overflow-y-auto nu-scrollbar flex-1">
            {stage === "idle" && <UploadZone onExtract={handleExtract} />}

            {stage === "processing" && batchProgress && (
              <div className="flex flex-col items-center justify-center gap-4 py-10">
                <Loader2 size={28} className="animate-spin text-[var(--nu-accent)]" />
                <div className="text-center">
                  <p className="text-[13px] font-semibold text-[var(--nu-text)]">
                    Processing PDF {batchProgress.fileIndex + 1} of {batchProgress.totalFiles}
                  </p>
                  <p className="text-[12px] text-[var(--nu-text-muted)] mt-0.5 truncate max-w-xs" title={batchProgress.fileName}>
                    {batchProgress.fileName}
                  </p>
                  <p className="text-[11.5px] text-[var(--nu-accent)] font-medium mt-1.5">{STAGE_LABEL[batchProgress.stage]}</p>
                </div>
                <div className="w-full max-w-xs h-1.5 rounded-full bg-[var(--nu-surface-alt)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--nu-accent)] transition-all duration-200"
                    style={{ width: `${overallPercent}%` }}
                  />
                </div>
                <p className="text-[11px] text-[var(--nu-text-muted)]">{overallPercent}%</p>
              </div>
            )}

            {stage === "error" && (
              <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                <AlertCircle size={28} className="text-[var(--nu-danger)]" />
                <p className="text-[13px] font-semibold text-[var(--nu-text)]">{error}</p>
                <Button type="button" variant="outline" size="sm" icon={<RotateCcw size={14} />} onClick={reset}>
                  Try Again
                </Button>
              </div>
            )}

            {stage === "results" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-semibold text-[var(--nu-text)]">
                    {successCount}/{batchResults.length} successfully processed
                  </p>
                </div>
                <div className="space-y-2">
                  {batchResults.map((result) => (
                    <div
                      key={result.id}
                      className="flex items-center justify-between gap-3 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-3.5 py-3"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        {result.status === "success" ? (
                          <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle size={16} className="text-[var(--nu-danger)] shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0">
                          <p className="text-[12.5px] font-semibold text-[var(--nu-text)] truncate" title={result.file.name}>
                            {result.file.name}
                          </p>
                          <p className="text-[11px] text-[var(--nu-text-muted)]">{formatFileSize(result.file.size)}</p>
                          {result.status !== "success" && (
                            <p className="text-[11px] text-[var(--nu-danger)] mt-0.5">{result.errorMessage}</p>
                          )}
                          {result.status === "success" && result.aiFallbackUsed && (
                            <p className="text-[11px] text-amber-600 mt-0.5">
                              Claude verification unavailable — standard extraction used for this PDF.
                            </p>
                          )}
                        </div>
                      </div>
                      {result.status === "success" && (
                        <Button type="button" variant="outline" size="sm" onClick={() => openPreview(result)} className="shrink-0">
                          Review
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stage === "preview" && activeResult?.response && (
              <div className="space-y-4">
                <WarningsPanel warnings={allWarnings} unmappedFields={activeResult.response.unmappedFields} />
                <PdfPreview response={activeResult.response} />
              </div>
            )}
          </div>

          {/* Footer */}
          {stage === "preview" && (
            <div className="flex items-center justify-between gap-3 border-t border-[var(--nu-border)] p-4 shrink-0">
              <div className="flex items-center gap-2">
                {batchResults.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" icon={<ChevronLeft size={14} />} onClick={() => setStage("results")}>
                    Back to Results
                  </Button>
                )}
                <Button type="button" variant="ghost" size="sm" onClick={reset}>
                  Upload Different Files
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={handleClose}>
                  Cancel
                </Button>
                <Button type="button" variant="primary" size="sm" icon={<Sparkles size={14} />} onClick={handleApply}>
                  Apply to Form
                </Button>
              </div>
            </div>
          )}

          {stage === "results" && (
            <div className="flex items-center justify-between gap-3 border-t border-[var(--nu-border)] p-4 shrink-0">
              <Button type="button" variant="ghost" size="sm" onClick={reset}>
                Upload Different Files
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={handleClose}>
                Close
              </Button>
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
};

export default ImportPdfModal;
