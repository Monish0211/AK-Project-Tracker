import { useId, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent, type RefObject } from "react";
import { FileText, Image as ImageIcon, Mail, Upload, X } from "lucide-react";
import { Badge } from "../../../../components/ui/Badge";
import { FormLabel } from "../../../../components/ui/FormLabel";
import {
  ALLOWED_ATTACHMENT_LABELS,
  ATTACHMENT_ACCEPT,
  ATTACHMENT_LIMITS,
  describeAttachment,
  dragCarriesFiles,
  emailSizeWarning,
  filesFromList,
  formatFileSize,
  totalAttachmentBytes,
  type AttachmentKind,
} from "../../../../utils/invoiceRequestAttachments";

const MB = 1024 * 1024;
const KIND_ICON: Record<AttachmentKind, typeof FileText> = { email: Mail, image: ImageIcon, document: FileText };

export interface AttachmentDropZoneViewProps {
  files: readonly File[];
  errors: readonly string[];
  /** A drag carrying files is over the zone — the zone lights up. */
  dragging: boolean;
  /** Nothing can be added right now (the form is being submitted). */
  disabled: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onBrowse: () => void;
  onZoneKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemove: (index: number) => void;
}

/**
 * The attachment area of the Request Invoice form, as a pure view: a drop zone (click, Enter or Space opens the file picker; dropping files adds
 * them), the reasons any file was refused, and the selected files — each with its type, size and a remove button. An exported email conversation
 * (.eml / .msg) is labelled "Email conversation". Everything it shows is a prop, so each state can be rendered and tested without a browser.
 */
export function AttachmentDropZoneView({ inputRef, ...p }: AttachmentDropZoneViewProps) {
  const hintId = useId();
  const atLimit = p.files.length >= ATTACHMENT_LIMITS.maxFiles;
  const warning = emailSizeWarning(p.files);
  const prompt = p.dragging ? "Drop to attach" : atLimit ? `Maximum of ${ATTACHMENT_LIMITS.maxFiles} files attached` : "Drag and drop files here, or";

  return (
    <div data-testid="request-invoice-attachments">
      <FormLabel>Attachments (optional)</FormLabel>
      <input ref={inputRef} type="file" multiple accept={ATTACHMENT_ACCEPT} className="hidden" tabIndex={-1} onChange={p.onInputChange} aria-label="Choose attachments" />
      <div
        role="button"
        tabIndex={p.disabled ? -1 : 0}
        aria-disabled={p.disabled}
        aria-label={`Add attachments. Drop files here, or press Enter to browse. Allowed: ${ALLOWED_ATTACHMENT_LABELS}.`}
        aria-describedby={hintId}
        onClick={p.disabled ? undefined : p.onBrowse}
        onKeyDown={p.onZoneKeyDown}
        onDragEnter={p.onDragEnter}
        onDragOver={p.onDragOver}
        onDragLeave={p.onDragLeave}
        onDrop={p.onDrop}
        data-dropzone
        data-dragging={p.dragging}
        className={`flex flex-col items-center justify-center gap-1 rounded-[var(--nu-radius-md)] border-2 border-dashed px-4 py-4 sm:py-5 text-center transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[var(--nu-accent)]/50 ${
          p.dragging
            ? "border-[var(--nu-accent)] bg-[var(--nu-accent-soft)]"
            : "border-[var(--nu-border)] bg-[var(--nu-surface-alt)] hover:border-[var(--nu-accent)]/60"
        } ${p.disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <Upload size={20} aria-hidden="true" className={p.dragging ? "text-[var(--nu-accent)]" : "text-[var(--nu-text-muted)]"} />
        <p className="text-[12.5px] font-medium text-[var(--nu-text)]">
          {prompt}
          {!p.dragging && !atLimit && <span className="ml-1 text-[var(--nu-accent)] underline underline-offset-2">browse</span>}
        </p>
        <p className="text-[11px] text-[var(--nu-text-muted)]">Email conversations (.eml, .msg or a PDF export), documents and images</p>
      </div>
      <p id={hintId} className="text-[11px] text-[var(--nu-text-muted)] mt-1.5">
        Up to {ATTACHMENT_LIMITS.maxFiles} files, {ATTACHMENT_LIMITS.maxFileBytes / MB} MB each, {ATTACHMENT_LIMITS.maxTotalBytes / MB} MB in total ({ALLOWED_ATTACHMENT_LABELS}). They are attached to the email sent
        to the responsible person and to everyone in CC.
      </p>
      <p className="sr-only" role="status" aria-live="polite" data-selected-count>
        {p.files.length === 0 ? "" : `${p.files.length} file${p.files.length === 1 ? "" : "s"} selected`}
      </p>

      {p.errors.length > 0 && (
        <ul role="alert" className="mt-2 space-y-1 text-[12px] text-red-600 dark:text-red-400" data-attachment-errors>
          {p.errors.map((message, i) => (
            <li key={`${i}-${message}`} className="break-words">
              {message}
            </li>
          ))}
        </ul>
      )}

      {p.files.length > 0 && (
        <ul className="mt-2 space-y-1.5" aria-label="Selected attachments">
          {p.files.map((file, index) => {
            const info = describeAttachment(file.name);
            const Icon = KIND_ICON[info.kind];
            return (
              <li
                key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                className="flex items-center gap-2.5 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-3 py-2 text-[12.5px]"
                data-attachment={file.name}
              >
                <Icon size={16} aria-hidden="true" className={`shrink-0 ${info.isEmailConversation ? "text-[var(--nu-accent)]" : "text-[var(--nu-text-muted)]"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-[var(--nu-text)]" title={file.name}>
                    {file.name}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--nu-text-muted)]">
                    {info.isEmailConversation ? (
                      <Badge tone="accent" className="text-[10.5px]">
                        <span data-email-conversation>Email conversation</span>
                      </Badge>
                    ) : null}
                    <span data-file-type>{info.typeLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span data-file-size>{formatFileSize(file.size)}</span>
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => p.onRemove(index)}
                  disabled={p.disabled}
                  aria-label={`Remove ${file.name}`}
                  className="shrink-0 rounded-full p-1.5 text-[var(--nu-text-muted)] hover:bg-black/10 dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nu-accent)]/50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <X size={13} aria-hidden="true" />
                </button>
              </li>
            );
          })}
          <li className="text-[11px] text-[var(--nu-text-muted)]">
            {p.files.length} of {ATTACHMENT_LIMITS.maxFiles} files · {formatFileSize(totalAttachmentBytes(p.files))} of {ATTACHMENT_LIMITS.maxTotalBytes / MB} MB
          </li>
        </ul>
      )}
      {warning && (
        <p role="status" className="mt-2 text-[11.5px] text-amber-600 dark:text-amber-400">
          {warning}
        </p>
      )}
    </div>
  );
}

/**
 * The drop zone with its behaviour. Files arrive from a drop or from the file picker and are handed to `onFilesAdded` — the form's own
 * addAttachments() decides which are kept and why any are refused (type, size, count, duplicates). A drag that does not carry files is ignored.
 */
export function AttachmentDropZone({ files, errors, disabled, onFilesAdded, onRemove }: { files: readonly File[]; errors: readonly string[]; disabled: boolean; onFilesAdded: (files: File[]) => void; onRemove: (index: number) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const depth = useRef(0); // dragenter / dragleave also fire for every child element; only the outermost leave ends the drag
  const [dragging, setDragging] = useState(false);

  const endDrag = () => {
    depth.current = 0;
    setDragging(false);
  };

  return (
    <AttachmentDropZoneView
      files={files}
      errors={errors}
      dragging={dragging}
      disabled={disabled}
      inputRef={inputRef}
      onBrowse={() => inputRef.current?.click()}
      onZoneKeyDown={(event) => {
        if (disabled || event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragEnter={(event) => {
        if (disabled || !dragCarriesFiles(event.dataTransfer?.types)) return;
        event.preventDefault();
        depth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (disabled || !dragCarriesFiles(event.dataTransfer?.types)) return;
        event.preventDefault(); // without this the browser refuses the drop
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        if (!dragging) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        endDrag();
        if (disabled) return;
        const dropped = filesFromList(event.dataTransfer?.files);
        if (dropped.length > 0) onFilesAdded(dropped);
      }}
      onInputChange={(event) => {
        const chosen = filesFromList(event.target.files);
        if (chosen.length > 0) onFilesAdded(chosen);
        event.target.value = ""; // choosing the same file again (after removing it) must fire a change event
      }}
      onRemove={onRemove}
    />
  );
}
