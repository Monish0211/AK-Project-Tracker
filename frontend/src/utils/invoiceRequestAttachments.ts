/**
 * Request Invoice attachments (Oct 2026) — the limits and checks the Request Invoice form applies BEFORE anything is sent. The
 * backend (Backend/src/modules/invoiceRequests/invoiceRequestAttachments.rules.ts) enforces the same limits again and also checks
 * the real file contents; this only gives the user an immediate, clear message instead of a failed upload.
 */

const MB = 1024 * 1024;

export const ATTACHMENT_LIMITS = {
  maxFiles: 5,
  maxFileBytes: 10 * MB,
  maxTotalBytes: 20 * MB,
} as const;

export const ALLOWED_ATTACHMENT_EXTENSIONS = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".csv", ".txt", ".png", ".jpg", ".jpeg", ".eml", ".msg"] as const;

export const ALLOWED_ATTACHMENT_LABELS = "PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, CSV, TXT, PNG, JPG, JPEG, EML, MSG";

/** Saved email messages: exported email conversations (a PDF export of a conversation is an ordinary PDF). The server checks their real contents. */
const EMAIL_CONVERSATION_EXTENSIONS = [".eml", ".msg"] as const;

/** Value for <input type="file" accept> — a convenience for the file dialog only; the real check is below and on the server. */
export const ATTACHMENT_ACCEPT = ALLOWED_ATTACHMENT_EXTENSIONS.join(",");

/**
 * Files together above this are saved but may be too large for the notification EMAIL (files grow by about a third when emailed
 * and the server decides the final limit), in which case the email says plainly that they could not be attached. Shown as a
 * warning only — it never blocks a submission.
 */
export const EMAIL_ATTACH_WARN_BYTES = 14 * MB;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

export type AttachmentKind = "email" | "image" | "document";

/** What to show beside a selected file: a short type label and whether it is an email conversation (.eml / .msg). Judged from the file name only. */
export function describeAttachment(fileName: string): { typeLabel: string; kind: AttachmentKind; isEmailConversation: boolean } {
  const ext = extensionOf(fileName);
  const isEmailConversation = (EMAIL_CONVERSATION_EXTENSIONS as readonly string[]).includes(ext);
  const kind: AttachmentKind = isEmailConversation ? "email" : [".png", ".jpg", ".jpeg"].includes(ext) ? "image" : "document";
  return { typeLabel: ext ? ext.slice(1).toUpperCase() : "FILE", kind, isEmailConversation };
}

/** True when a drag carries files (not text or a link) — only then does the drop zone light up and accept the drop. */
export function dragCarriesFiles(types: ArrayLike<string> | null | undefined): boolean {
  return !!types && Array.from(types).includes("Files");
}

/** The files of a drop or a file-picker selection as a plain array (never throws, empty when there are none). */
export function filesFromList(list: { length: number; [index: number]: File } | null | undefined): File[] {
  return list ? Array.from({ length: list.length }, (_, i) => list[i]!) : [];
}

type FileLike = Pick<File, "name" | "size"> & { lastModified?: number };

const sameFile = (a: FileLike, b: FileLike) => a.name === b.name && a.size === b.size && (a.lastModified ?? 0) === (b.lastModified ?? 0);

/**
 * Adds newly chosen files to the current selection. Every file that passes is kept; every file that does not is skipped with a
 * specific message. Never throws, never mutates its inputs.
 */
export function addAttachments<T extends FileLike>(current: readonly T[], incoming: readonly T[]): { files: T[]; errors: string[] } {
  const files = [...current];
  const errors: string[] = [];
  let total = files.reduce((sum, f) => sum + f.size, 0);

  for (const file of incoming) {
    if (files.some((existing) => sameFile(existing, file))) {
      errors.push(`"${file.name}" is already added.`);
      continue;
    }
    if (!(ALLOWED_ATTACHMENT_EXTENSIONS as readonly string[]).includes(extensionOf(file.name))) {
      errors.push(`"${file.name}" is not an allowed file type. Allowed types: ${ALLOWED_ATTACHMENT_LABELS}.`);
      continue;
    }
    if (file.size === 0) {
      errors.push(`"${file.name}" is empty and cannot be attached.`);
      continue;
    }
    if (file.size > ATTACHMENT_LIMITS.maxFileBytes) {
      errors.push(`"${file.name}" is ${formatFileSize(file.size)} — each file must be ${ATTACHMENT_LIMITS.maxFileBytes / MB} MB or smaller.`);
      continue;
    }
    if (files.length >= ATTACHMENT_LIMITS.maxFiles) {
      errors.push(`You can attach at most ${ATTACHMENT_LIMITS.maxFiles} files. "${file.name}" was not added.`);
      continue;
    }
    if (total + file.size > ATTACHMENT_LIMITS.maxTotalBytes) {
      errors.push(`Adding "${file.name}" would take the attachments over the ${ATTACHMENT_LIMITS.maxTotalBytes / MB} MB total limit.`);
      continue;
    }
    files.push(file);
    total += file.size;
  }
  return { files, errors };
}

export function totalAttachmentBytes(files: readonly Pick<File, "size">[]): number {
  return files.reduce((sum, f) => sum + f.size, 0);
}

/** A non-blocking heads-up when the selection may be too large to email (see EMAIL_ATTACH_WARN_BYTES), otherwise null. */
export function emailSizeWarning(files: readonly Pick<File, "size">[]): string | null {
  if (totalAttachmentBytes(files) <= EMAIL_ATTACH_WARN_BYTES) return null;
  return `These files total ${formatFileSize(totalAttachmentBytes(files))}. They will be saved with the request, but may be too large to attach to the notification email — if so, the email will say that the files could not be attached.`;
}

/** What (if anything) to say about the notification email. "pending" never reads as "sent". */
export function emailOutcomeNote(emailStatus: string | null | undefined, hasAttachments: boolean): { label: string; tone: "neutral" | "warning" | "danger" } | null {
  switch (emailStatus) {
    case "failed":
      return { label: "Notification email failed", tone: "danger" };
    case "unconfirmed":
      return { label: "Email delivery unconfirmed", tone: "warning" };
    case "sent_without_attachments":
      return { label: "Email sent without attachments", tone: "warning" };
    case "pending":
      return hasAttachments ? { label: "Sending email with attachments…", tone: "neutral" } : null;
    default:
      return null;
  }
}
