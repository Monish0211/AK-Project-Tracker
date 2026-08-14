import { useState } from "react";
import { AlertCircle, FileUp, Loader2, RotateCcw, X } from "lucide-react";
import type { Project } from "../../../../types/Project";
import type { PdfImportResponse, PdfImportWarning } from "../../../../types/PdfImport";
import type { PdfUploadStage } from "../../../../types/PdfImport";
import { uploadAndExtractPdf } from "../../../../services/pdfImportService";
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

const STAGE_LABEL: Record<"uploading" | "processing", string> = {
  uploading: "Uploading document…",
  processing: "Extracting data…",
};

/**
 * Owns the whole Upload → Extract → Preview → Apply flow. Version 1 has no
 * backend — uploadAndExtractPdf() (pdfImportService.ts) returns mock data —
 * but this component only ever talks to that one function's public
 * signature, so pointing it at a real backend later is a change inside
 * that file only, never here. Never touches Project fields directly:
 * mapPdfImportResponseToProject() (pdfImportMapper.ts) is the only place
 * that happens, and only on Apply.
 */
export const ImportPdfModal = ({ isOpen, onClose, project, onApply }: Props) => {
  const [stage, setStage] = useState<PdfUploadStage>("idle");
  const [progress, setProgress] = useState<{ stage: "uploading" | "processing"; percent: number }>({
    stage: "uploading",
    percent: 0,
  });
  const [response, setResponse] = useState<PdfImportResponse | null>(null);
  const [computedWarnings, setComputedWarnings] = useState<PdfImportWarning[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const reset = () => {
    setStage("idle");
    setResponse(null);
    setComputedWarnings([]);
    setError(null);
    setProgress({ stage: "uploading", percent: 0 });
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleExtract = async (file: File) => {
    setStage("uploading");
    setError(null);
    try {
      const result = await uploadAndExtractPdf(file, (event) => {
        setStage(event.stage === "uploading" ? "uploading" : "processing");
        setProgress(event);
      });
      setResponse(result);
      setComputedWarnings(validatePdfImportResponse(result));
      setStage("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to extract data from this document. Please try again.");
      setStage("error");
    }
  };

  const handleApply = () => {
    if (!response) return;
    const updatedProject = mapPdfImportResponseToProject(response, project);
    onApply(updatedProject);
    handleClose();
  };

  const allWarnings = response ? [...response.warnings, ...computedWarnings] : [];

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
                  Upload a Work Order, Purchase Order, Proposal, or Client PDF to auto-fill this form.
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

            {(stage === "uploading" || stage === "processing") && (
              <div className="flex flex-col items-center justify-center gap-4 py-10">
                <Loader2 size={28} className="animate-spin text-[var(--nu-accent)]" />
                <p className="text-[13px] font-semibold text-[var(--nu-text)]">{STAGE_LABEL[progress.stage]}</p>
                <div className="w-full max-w-xs h-1.5 rounded-full bg-[var(--nu-surface-alt)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--nu-accent)] transition-all duration-200"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
                <p className="text-[11px] text-[var(--nu-text-muted)]">{progress.percent}%</p>
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

            {stage === "preview" && response && (
              <div className="space-y-4">
                <WarningsPanel warnings={allWarnings} unmappedFields={response.unmappedFields} />
                <PdfPreview response={response} />
              </div>
            )}
          </div>

          {/* Footer */}
          {stage === "preview" && (
            <div className="flex items-center justify-between gap-3 border-t border-[var(--nu-border)] p-4 shrink-0">
              <Button type="button" variant="ghost" size="sm" onClick={reset}>
                Upload a Different File
              </Button>
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={handleClose}>
                  Cancel
                </Button>
                <Button type="button" variant="primary" size="sm" onClick={handleApply}>
                  Apply to Form
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
};

export default ImportPdfModal;
