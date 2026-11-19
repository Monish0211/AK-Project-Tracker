import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { FileText, FileSpreadsheet, Image as ImageIcon, File as FileIcon, Upload, Download, Trash2, Lock, Paperclip, RotateCw, X, AlertTriangle, UploadCloud } from "lucide-react";
import { Card, CardHeader, CardBody } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { EmptyState } from "../../../components/ui/EmptyState";
import { usePmoToast } from "../../../components/ui/usePmoToast";
import { getUserFriendlyErrorMessage } from "../../../utils/errorMessage";
import { useAuth } from "../../../auth/authContext";
import type { ProjectDocument } from "../../../types/Document";
import {
  listProjectDocuments,
  listPRRequestDocuments,
  uploadProjectDocument,
  uploadPRRequestDocument,
  deleteDocument,
  downloadDocument,
} from "../../../services/documentService";
import { DOCUMENT_MAX_FILE_SIZE_MB, fileIdentity, formatFileSize, selectDocumentFiles } from "../../../utils/documentUpload";

/**
 * Add Project client-side staging (Option C — see the approved architecture
 * report). A file picked before the real Project id exists is held ONLY in
 * this shape, in memory, on this page — never sent to the backend until
 * ProjectForm.tsx's flushPendingDocuments() call succeeds in creating (or
 * already has) a real Project id. Nothing here is persisted anywhere:
 * closing the tab, Cancel, or Reset all discard it for free, with zero
 * server-side residue, because nothing was ever written server-side.
 */
export interface PendingDocument {
  localId: string;
  file: File;
  status: "pending" | "uploading" | "failed";
  error?: string;
  /** 0-100 while uploading (Nov 2026). */
  progress?: number;
}

/** A file being uploaded straight to an existing Project / PR Request (direct mode): one at a time, in pick order. */
interface DirectUpload {
  localId: string;
  file: File;
  status: "queued" | "uploading" | "failed";
  progress: number;
  error?: string;
}

interface Props {
  ownerType: "project" | "prRequest";
  /** null means the owning Project/PR Request Draft doesn't have a real id yet — renders the locked state instead of fetching anything, UNLESS onStageFile is provided (Add Project staging mode). */
  ownerId: string | null;
  /** View Project / review contexts — view & download only, no upload or delete controls rendered at all. */
  readOnly?: boolean;
  /** Shown while ownerId is null and staging is not enabled — each call site supplies its own copy per the agreed spec. */
  lockedMessage?: string;
  /**
   * Add Project only. When provided, the card renders staging mode instead
   * of the locked state while ownerId is still null: Upload Document is
   * enabled immediately, and picked files are handed to this callback
   * instead of being uploaded. PR Request/Edit/View Project never pass
   * this — their locked/normal behavior is completely unchanged.
   */
  onStageFile?: (file: File) => void;
  /** Files still awaiting upload (fresh picks) or that failed a flush attempt — rendered merged with the real, already-uploaded list. */
  pendingDocuments?: PendingDocument[];
  onRemoveStaged?: (localId: string) => void;
  onRetryStaged?: (localId: string) => void;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function iconForMimeType(mimeType: string) {
  if (mimeType === "application/pdf") return FileText;
  if (mimeType.startsWith("image/")) return ImageIcon;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return FileSpreadsheet;
  return FileIcon;
}

/** True when a drag carries files (not text or a link dragged from the page). */
function dragHasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div
      className="mt-1 h-1.5 w-full max-w-[220px] rounded-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] overflow-hidden"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <div className="h-full bg-[var(--nu-accent)] transition-[width] duration-200" style={{ width: `${percent}%` }} />
    </div>
  );
}

function statusLine(status: string, progress: number | undefined, error: string | undefined): string {
  if (status === "uploading") return `Uploading ${progress ?? 0}%`;
  if (status === "queued") return "Waiting to upload";
  if (status === "pending") return "Pending upload — attached when saved";
  return error ? `Failed — ${error}` : "Failed — tap Retry";
}

/** One file that is staged, queued, uploading or failed. A component (not a render helper) so its Retry / Remove callbacks are plain props. */
function FileTypeIcon({ mimeType }: { mimeType: string }) {
  if (mimeType === "application/pdf") return <FileText size={15} />;
  if (mimeType.startsWith("image/")) return <ImageIcon size={15} />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return <FileSpreadsheet size={15} />;
  return <FileIcon size={15} />;
}

function QueuedRow({ row, onRetry, onRemove }: { row: { localId: string; file: File; status: string; progress?: number; error?: string }; onRetry?: () => void; onRemove?: () => void }) {
  const isFailed = row.status === "failed";
  return (
    <li className="flex items-center justify-between gap-3 py-2.5" data-testid="document-upload-row" data-status={row.status}>
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <div
          className={`w-8 h-8 rounded-[var(--nu-radius-md)] border flex items-center justify-center shrink-0 ${
            isFailed
              ? "bg-[var(--nu-danger-soft)] border-[var(--nu-danger)]/30 text-[var(--nu-danger)]"
              : "bg-[var(--nu-surface-alt)] border-[var(--nu-border)] text-[var(--nu-text-muted)]"
          }`}
        >
          {isFailed ? <AlertTriangle size={15} /> : <FileTypeIcon mimeType={row.file.type} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold text-[var(--nu-text)] truncate" title={row.file.name}>
            {row.file.name}
          </p>
          <p className={`text-[11px] ${isFailed ? "text-[var(--nu-danger)]" : "text-[var(--nu-text-muted)]"}`}>
            {formatFileSize(row.file.size)} · {statusLine(row.status, row.progress, row.error)}
          </p>
          {row.status === "uploading" && <ProgressBar percent={row.progress ?? 0} />}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {isFailed && onRetry && (
          <Button type="button" variant="ghost" size="icon" title="Retry upload" onClick={onRetry}>
            <RotateCw size={14} />
          </Button>
        )}
        {row.status !== "uploading" && onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Remove"
            className="text-[var(--nu-danger)] hover:bg-[var(--nu-danger-soft)]"
            onClick={onRemove}
          >
            <X size={14} />
          </Button>
        )}
      </div>
    </li>
  );
}

const ProjectDocumentsCard = ({
  ownerType,
  ownerId,
  readOnly = false,
  lockedMessage,
  onStageFile,
  pendingDocuments = [],
  onRemoveStaged,
  onRetryStaged,
}: Props) => {
  const { user } = useAuth();
  const isAdministrator = user?.role === "Administrator";
  const { showToast } = usePmoToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [uploads, setUploads] = useState<DirectUpload[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragDepth = useRef(0);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  // Same "derive isLoading from a loadedFor/current comparison" convention
  // ViewProject.tsx already uses (its own loadedId/id pair) — avoids an
  // explicit setIsLoading(true) at the top of the effect body.
  const [loadedForOwnerId, setLoadedForOwnerId] = useState<string | null>(null);
  const isLoading = ownerId !== null && loadedForOwnerId !== ownerId;
  const isUploading = uploads.some((u) => u.status === "uploading" || u.status === "queued");

  useEffect(() => {
    // ownerId is null only in the locked/staged state, neither of which
    // ever renders `documents` — nothing to reset here.
    if (!ownerId) return;

    let isMounted = true;
    const load = ownerType === "project" ? listProjectDocuments(ownerId) : listPRRequestDocuments(ownerId);
    load
      .then((result) => {
        if (isMounted) setDocuments(result);
      })
      .catch((err) => {
        if (isMounted) showToast({ type: "error", message: getUserFriendlyErrorMessage(err, "Failed to load documents.") });
      })
      .finally(() => {
        if (isMounted) setLoadedForOwnerId(ownerId);
      });

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, ownerType]);

  // Direct mode: upload the queue ONE file at a time (bounded server memory for files up to 100 MB). The queue lives in a ref (the
  // source of truth the runner reads synchronously) and is mirrored into state for rendering. Only one runner can be active
  // (runningRef), so a fast second pick or drop can never start a parallel or duplicate upload; the runner is started when files are
  // queued or retried and restarts itself after each upload until nothing is queued.
  const uploadsRef = useRef<DirectUpload[]>([]);
  const runningRef = useRef(false);
  const updateUploads = (fn: (prev: DirectUpload[]) => DirectUpload[]) => {
    uploadsRef.current = fn(uploadsRef.current);
    setUploads(uploadsRef.current);
  };
  const runQueue = (target: string | null) => {
    if (!target || runningRef.current) return;
    const next = uploadsRef.current.find((u) => u.status === "queued");
    if (!next) return;
    runningRef.current = true;
    updateUploads((prev) => prev.map((u) => (u.localId === next.localId ? { ...u, status: "uploading", progress: 0, error: undefined } : u)));
    const onProgress = ({ percent }: { percent: number }) =>
      updateUploads((prev) => prev.map((u) => (u.localId === next.localId && u.status === "uploading" ? { ...u, progress: percent } : u)));
    const upload = ownerType === "project" ? uploadProjectDocument(target, next.file, onProgress) : uploadPRRequestDocument(target, next.file, onProgress);
    upload
      .then((uploaded) => {
        setDocuments((prev) => [uploaded, ...prev]);
        updateUploads((prev) => prev.filter((u) => u.localId !== next.localId));
        showToast({ type: "success", message: `${next.file.name} uploaded.` });
      })
      .catch((err) => {
        const message = getUserFriendlyErrorMessage(err, "Upload failed.");
        updateUploads((prev) => prev.map((u) => (u.localId === next.localId ? { ...u, status: "failed", error: message } : u)));
        showToast({ type: "error", message: `${next.file.name}: ${message}` });
      })
      .finally(() => {
        runningRef.current = false;
        runQueue(target);
      });
  };

  /** Validates a picked / dropped batch, skips duplicates, then stages (no owner yet) or queues for upload. */
  const handleFilesChosen = (fileList: FileList | File[] | null | undefined) => {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;
    const taken = new Set([...pendingDocuments.map((p) => fileIdentity(p.file)), ...uploads.map((u) => fileIdentity(u.file))]);
    const uploaded = new Set(documents.map((d) => `${d.fileName}|${d.fileSizeBytes}`));
    const { accepted, rejected, duplicates } = selectDocumentFiles(files, taken, uploaded);

    for (const { file, reason } of rejected) showToast({ type: "error", message: `${file.name} was not added. ${reason}` });
    if (duplicates.length > 0) {
      showToast({
        type: "info",
        message: duplicates.length === 1 ? `${duplicates[0]!.name} is already added.` : `${duplicates.length} files are already added and were skipped.`,
      });
    }
    if (accepted.length === 0) return;

    if (!ownerId) {
      // Add Project / new PR Request, before the real id exists — stage only, never call the upload API.
      for (const file of accepted) onStageFile?.(file);
      return;
    }
    updateUploads((prev) => [...prev, ...accepted.map((file) => ({ localId: crypto.randomUUID(), file, status: "queued" as const, progress: 0 }))]);
    runQueue(ownerId);
  };

  const retryUpload = (localId: string) => {
    updateUploads((prev) => prev.map((u) => (u.localId === localId && u.status === "failed" ? { ...u, status: "queued", progress: 0, error: undefined } : u)));
    runQueue(ownerId);
  };
  const removeUpload = (localId: string) => updateUploads((prev) => prev.filter((u) => u.localId !== localId || u.status === "uploading"));

  const handleDownload = async (doc: ProjectDocument) => {
    try {
      await downloadDocument(doc.id, doc.fileName);
    } catch (err) {
      showToast({ type: "error", message: getUserFriendlyErrorMessage(err, "Failed to download document.") });
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    try {
      await deleteDocument(id);
      setDocuments((prev) => prev.filter((doc) => doc.id !== id));
      showToast({ type: "success", message: "Document deleted successfully." });
    } catch (err) {
      showToast({ type: "error", message: getUserFriendlyErrorMessage(err, "Failed to delete document.") });
    }
  };

  // Locked state — unchanged for every existing caller (PR Request before
  // Draft save, and any future ownerType with no staging support). Add
  // Project instead passes onStageFile, which routes here to staging mode.
  if (!ownerId && !onStageFile) {
    return (
      <Card>
        <CardHeader icon={<Paperclip size={16} />} title="Project Documents" />
        <CardBody>
          <EmptyState
            icon={<Lock size={18} />}
            title="Documents locked"
            description={lockedMessage ?? "Save first to enable document uploads."}
          />
        </CardBody>
      </Card>
    );
  }

  const showUploadControl = !readOnly && (ownerId !== null || !!onStageFile);
  const isEmpty = documents.length === 0 && pendingDocuments.length === 0 && uploads.length === 0;
  const openPicker = () => fileInputRef.current?.click();

  const dropHandlers = showUploadControl
    ? {
        onDragEnter: (e: DragEvent) => {
          if (!dragHasFiles(e)) return;
          e.preventDefault();
          dragDepth.current += 1;
          setIsDragOver(true);
        },
        onDragOver: (e: DragEvent) => {
          if (!dragHasFiles(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        },
        onDragLeave: (e: DragEvent) => {
          if (!dragHasFiles(e)) return;
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setIsDragOver(false);
        },
        onDrop: (e: DragEvent) => {
          if (!dragHasFiles(e)) return;
          e.preventDefault();
          dragDepth.current = 0;
          setIsDragOver(false);
          handleFilesChosen(e.dataTransfer.files);
        },
      }
    : {};

  return (
    <Card>
      <CardHeader
        icon={<Paperclip size={16} />}
        title="Project Documents"
        subtitle={readOnly ? undefined : `PDF, Word, Excel, images, and other business documents — up to ${DOCUMENT_MAX_FILE_SIZE_MB} MB per file`}
        action={
          showUploadControl && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                data-testid="document-file-input"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  handleFilesChosen(files);
                }}
              />
              <Button type="button" variant="outline" size="sm" icon={<Upload size={13} />} onClick={openPicker}>
                {isUploading ? "Add more..." : "Upload Document"}
              </Button>
            </>
          )
        }
      />
      <CardBody>
        {showUploadControl && (
          <div
            {...dropHandlers}
            data-testid="document-drop-zone"
            data-drag-over={isDragOver ? "true" : "false"}
            role="button"
            tabIndex={0}
            aria-label={`Drag and drop files here or browse. Up to ${DOCUMENT_MAX_FILE_SIZE_MB} MB per file.`}
            onClick={openPicker}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openPicker();
              }
            }}
            className={`mb-3 flex flex-col items-center justify-center gap-1 rounded-[var(--nu-radius-md)] border-2 border-dashed px-4 py-5 text-center cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--nu-accent)] ${
              isDragOver
                ? "border-[var(--nu-accent)] bg-[var(--nu-accent-soft)] text-[var(--nu-accent)]"
                : "border-[var(--nu-border)] bg-[var(--nu-surface-alt)]/40 text-[var(--nu-text-muted)] hover:border-[var(--nu-accent)]/60"
            }`}
          >
            <UploadCloud size={22} className={isDragOver ? "text-[var(--nu-accent)]" : "text-[var(--nu-text-muted)]"} />
            <p className="text-[12.5px] font-semibold text-[var(--nu-text)]">
              {isDragOver ? "Drop files to add them" : (
                <>
                  Drag &amp; drop files here, or <span className="text-[var(--nu-accent)] underline underline-offset-2">browse</span>
                </>
              )}
            </p>
            <p className="text-[11px]">
              Several files at once · up to {DOCUMENT_MAX_FILE_SIZE_MB} MB each · executable and script files are not allowed
            </p>
          </div>
        )}

        {isLoading ? (
          <p className="text-[12.5px] text-[var(--nu-text-muted)] text-center py-4">Loading documents...</p>
        ) : isEmpty ? (
          <EmptyState
            icon={<Paperclip size={18} />}
            title="No documents yet"
            description={
              readOnly
                ? "No documents have been uploaded."
                : ownerId === null
                ? "Documents you add now are attached once the Project is saved."
                : "Upload invoices, quotations, drawings, or other project documents."
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--nu-border)]">
            {pendingDocuments.map((pending) =>
              <QueuedRow key={pending.localId} row={pending} onRetry={pending.status === "failed" && onRetryStaged ? () => onRetryStaged(pending.localId) : undefined} onRemove={onRemoveStaged ? () => onRemoveStaged(pending.localId) : undefined} />
            )}

            {uploads.map((upload) =>
              <QueuedRow key={upload.localId} row={upload} onRetry={upload.status === "failed" ? () => retryUpload(upload.localId) : undefined} onRemove={() => removeUpload(upload.localId)} />
            )}

            {documents.map((doc) => {
              const Icon = iconForMimeType(doc.mimeType);
              return (
                <li key={doc.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-[var(--nu-radius-md)] bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] text-[var(--nu-text-muted)] flex items-center justify-center shrink-0">
                      <Icon size={15} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-semibold text-[var(--nu-text)] truncate" title={doc.fileName}>
                        {doc.fileName}
                      </p>
                      <p className="text-[11px] text-[var(--nu-text-muted)]">
                        {formatFileSize(doc.fileSizeBytes)} · {doc.uploadedByName} · {formatDate(doc.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button type="button" variant="ghost" size="icon" title="Download" onClick={() => void handleDownload(doc)}>
                      <Download size={14} />
                    </Button>
                    {!readOnly && isAdministrator && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="Delete"
                        className="text-[var(--nu-danger)] hover:bg-[var(--nu-danger-soft)]"
                        onClick={() => setPendingDeleteId(doc.id)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Delete Document?"
        message="This will permanently delete this document. This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </Card>
  );
};

export default ProjectDocumentsCard;
