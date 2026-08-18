import { useRef, useState } from "react";
import { AlertTriangle, File as FileIcon, Sparkles, UploadCloud, X } from "lucide-react";
import { Button } from "../../../../components/ui/Button";
import {
  MAX_PDF_FILE_COUNT,
  validateFileCount,
  validateUploadFile,
} from "../../../../services/pdfImportService";

interface Props {
  onExtract: (files: File[], useClaude: boolean) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Multi-file drag & drop + browse-file picker, restricted to .pdf, max
 * 20MB each, max 20 files total — see pdfImportService.ts's
 * validateUploadFile()/validateFileCount() for the shared rules both the
 * drop and browse paths defer to. One PDF continues to work exactly as
 * before: selecting a single file is simply a batch of size 1.
 */
export const UploadZone = ({ onExtract }: Props) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [useClaude, setUseClaude] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const acceptFiles = (incoming: File[]) => {
    if (incoming.length === 0) return;

    const countError = validateFileCount(selectedFiles.length, incoming.length);
    if (countError) {
      setError(countError);
      return;
    }

    const accepted: File[] = [];
    for (const file of incoming) {
      const validationError = validateUploadFile(file);
      if (validationError) {
        setError(`${file.name}: ${validationError}`);
        return;
      }
      accepted.push(file);
    }

    setError(null);
    setSelectedFiles((prev) => [...prev, ...accepted]);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    acceptFiles(Array.from(e.dataTransfer.files ?? []));
  };

  const handleBrowse = (e: React.ChangeEvent<HTMLInputElement>) => {
    acceptFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
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
          <p className="text-[13px] font-semibold text-[var(--nu-text)]">Drag & drop PDF files here</p>
          <p className="text-[11.5px] text-[var(--nu-text-muted)]">
            Select up to {MAX_PDF_FILE_COUNT} PDF files — maximum 20MB per file
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            Browse Files
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            multiple
            className="hidden"
            onChange={handleBrowse}
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-[var(--nu-radius-md)] border border-[var(--nu-danger)]/30 bg-[var(--nu-danger-soft)] px-3.5 py-2.5 text-[12.5px] font-medium text-[var(--nu-danger)]">
          <AlertTriangle size={14} strokeWidth={2.25} className="shrink-0" />
          {error}
        </div>
      )}

      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">
            Selected Files ({selectedFiles.length})
          </p>
          <div className="space-y-1.5 max-h-52 overflow-y-auto nu-scrollbar pr-0.5">
            {selectedFiles.map((file, index) => (
              <div
                key={`${file.name}-${file.size}-${index}`}
                className="flex items-center justify-between gap-3 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface)] px-3.5 py-2.5"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-[var(--nu-radius-md)] bg-[var(--nu-accent-soft)] text-[var(--nu-accent)] flex items-center justify-center shrink-0">
                    <FileIcon size={14} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-semibold text-[var(--nu-text)] truncate" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-[11px] text-[var(--nu-text-muted)]">{formatFileSize(file.size)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  aria-label={`Remove ${file.name}`}
                  className="p-1 rounded-[var(--nu-radius-md)] text-[var(--nu-text-muted)] hover:text-[var(--nu-danger)] hover:bg-[var(--nu-danger-soft)] transition-colors shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <label className="flex items-start gap-2.5 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-3.5 py-3 cursor-pointer">
        <input
          type="checkbox"
          checked={useClaude}
          onChange={(e) => setUseClaude(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded border-[var(--nu-border-strong)] accent-[var(--nu-accent)] cursor-pointer shrink-0"
        />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--nu-text)]">
            <Sparkles size={13} className="text-[var(--nu-accent)]" />
            Use Claude AI for enhanced extraction
          </span>
          <span className="block text-[11px] text-[var(--nu-text-muted)] mt-0.5">
            Uses Claude AI to improve and verify information extracted from the selected PDF files.
          </span>
        </span>
      </label>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={selectedFiles.length === 0}
          onClick={() => selectedFiles.length > 0 && onExtract(selectedFiles, useClaude)}
        >
          Extract Data
        </Button>
      </div>
    </div>
  );
};

export default UploadZone;
