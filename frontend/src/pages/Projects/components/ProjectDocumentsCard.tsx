import { useEffect, useRef, useState } from "react";
import { FileText, FileSpreadsheet, Image as ImageIcon, File as FileIcon, Upload, Download, Trash2, Lock, Paperclip, RotateCw, X, AlertTriangle } from "lucide-react";
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  const [isUploading, setIsUploading] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  // Same "derive isLoading from a loadedFor/current comparison" convention
  // ViewProject.tsx already uses (its own loadedId/id pair) — avoids an
  // explicit setIsLoading(true) at the top of the effect body.
  const [loadedForOwnerId, setLoadedForOwnerId] = useState<string | null>(null);
  const isLoading = ownerId !== null && loadedForOwnerId !== ownerId;

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

  const handleFileChosen = async (file: File) => {
    if (!ownerId) {
      // Add Project, before the real Project id exists — stage only,
      // never call the upload API. onStageFile is always defined here
      // (the file input itself is only rendered when either ownerId or
      // onStageFile is present — see the locked-state early return below).
      onStageFile?.(file);
      return;
    }
    setIsUploading(true);
    try {
      const uploaded = ownerType === "project" ? await uploadProjectDocument(ownerId, file) : await uploadPRRequestDocument(ownerId, file);
      setDocuments((prev) => [uploaded, ...prev]);
      showToast({ type: "success", message: "Document uploaded successfully." });
    } catch (err) {
      showToast({ type: "error", message: getUserFriendlyErrorMessage(err, "Failed to upload document.") });
    } finally {
      setIsUploading(false);
    }
  };

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
  const isEmpty = documents.length === 0 && pendingDocuments.length === 0;

  return (
    <Card>
      <CardHeader
        icon={<Paperclip size={16} />}
        title="Project Documents"
        subtitle={readOnly ? undefined : "PDF, Word, Excel, images, and other business documents"}
        action={
          showUploadControl && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void handleFileChosen(file);
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={<Upload size={13} />}
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? "Uploading..." : "Upload Document"}
              </Button>
            </>
          )
        }
      />
      <CardBody>
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
            {pendingDocuments.map((pending) => {
              const Icon = iconForMimeType(pending.file.type);
              const isFailed = pending.status === "failed";
              return (
                <li key={pending.localId} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-[var(--nu-radius-md)] border flex items-center justify-center shrink-0 ${
                        isFailed
                          ? "bg-[var(--nu-danger-soft)] border-[var(--nu-danger)]/30 text-[var(--nu-danger)]"
                          : "bg-[var(--nu-surface-alt)] border-[var(--nu-border)] text-[var(--nu-text-muted)]"
                      }`}
                    >
                      {isFailed ? <AlertTriangle size={15} /> : <Icon size={15} />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-semibold text-[var(--nu-text)] truncate" title={pending.file.name}>
                        {pending.file.name}
                      </p>
                      <p className={`text-[11px] ${isFailed ? "text-[var(--nu-danger)]" : "text-[var(--nu-text-muted)]"}`}>
                        {formatFileSize(pending.file.size)} ·{" "}
                        {pending.status === "pending" && "Pending upload"}
                        {pending.status === "uploading" && "Uploading..."}
                        {isFailed && (pending.error ? `Failed — ${pending.error}` : "Failed — tap Retry")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isFailed && onRetryStaged && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="Retry upload"
                        onClick={() => onRetryStaged(pending.localId)}
                      >
                        <RotateCw size={14} />
                      </Button>
                    )}
                    {pending.status !== "uploading" && onRemoveStaged && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="Remove"
                        className="text-[var(--nu-danger)] hover:bg-[var(--nu-danger-soft)]"
                        onClick={() => onRemoveStaged(pending.localId)}
                      >
                        <X size={14} />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}

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
