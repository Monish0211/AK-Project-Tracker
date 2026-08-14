import { useRef, useState } from "react";
import { AlertTriangle, File as FileIcon, UploadCloud, X } from "lucide-react";
import { Button } from "../../../../components/ui/Button";
import { MAX_PDF_FILE_SIZE_BYTES, validateUploadFile } from "../../../../services/pdfImportService";

interface Props {
  onExtract: (file: File) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Drag & drop + browse-file picker, restricted to .pdf, max 20MB — see pdfImportService.ts's validateUploadFile() for the single shared rule both paths defer to. */
export const UploadZone = ({ onExtract }: Props) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const acceptFile = (file: File) => {
    const validationError = validateUploadFile(file);
    if (validationError) {
      setError(validationError);
      setSelectedFile(null);
      return;
    }
    setError(null);
    setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) acceptFile(file);
  };

  const handleBrowse = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) acceptFile(file);
    e.target.value = "";
  };

  return (
    <div className="space-y-3.5">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`rounded-[var(--nu-radius-lg)] border-2 border-dashed p-8 text-center transition-colors ${
          isDragging
            ? "border-[var(--nu-accent)] bg-[var(--nu-accent-soft)]"
            : "border-[var(--nu-border)] bg-[var(--nu-surface-alt)]"
        }`}
      >
        <div className="flex flex-col items-center gap-2.5">
          <div className="w-11 h-11 rounded-full bg-[var(--nu-surface)] border border-[var(--nu-border)] flex items-center justify-center text-[var(--nu-accent)]">
            <UploadCloud size={20} />
          </div>
          <p className="text-[13px] font-semibold text-[var(--nu-text)]">Drag & drop a PDF here</p>
          <p className="text-[11.5px] text-[var(--nu-text-muted)]">Work Order, Purchase Order, Proposal, or Engineering Proposal — max 20MB</p>
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            Browse File
          </Button>
          <input ref={inputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleBrowse} />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-[var(--nu-radius-md)] border border-[var(--nu-danger)]/30 bg-[var(--nu-danger-soft)] px-3.5 py-2.5 text-[12.5px] font-medium text-[var(--nu-danger)]">
          <AlertTriangle size={14} strokeWidth={2.25} className="shrink-0" />
          {error}
        </div>
      )}

      {selectedFile && !error && (
        <div className="flex items-center justify-between gap-3 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface)] px-3.5 py-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-[var(--nu-radius-md)] bg-[var(--nu-accent-soft)] text-[var(--nu-accent)] flex items-center justify-center shrink-0">
              <FileIcon size={14} />
            </div>
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold text-[var(--nu-text)] truncate" title={selectedFile.name}>
                {selectedFile.name}
              </p>
              <p className="text-[11px] text-[var(--nu-text-muted)]">{formatFileSize(selectedFile.size)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelectedFile(null)}
            aria-label="Remove selected file"
            className="p-1 rounded-[var(--nu-radius-md)] text-[var(--nu-text-muted)] hover:text-[var(--nu-danger)] hover:bg-[var(--nu-danger-soft)] transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex justify-end">
        <Button type="button" variant="primary" size="sm" disabled={!selectedFile} onClick={() => selectedFile && onExtract(selectedFile)}>
          Extract Data
        </Button>
      </div>
    </div>
  );
};

export default UploadZone;
