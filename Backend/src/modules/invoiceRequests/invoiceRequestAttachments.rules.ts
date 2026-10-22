import path from "node:path";
import { AppError } from "../../shared/utils/AppError.js";
import { BLOCKED_MIME_TYPES, matchesSignature } from "../documents/documents.constants.js";

/**
 * Request Invoice attachments (Oct 2026) — pure rules, no Prisma / no I/O (same convention as invoiceRequestEmail.rules.ts).
 *
 * Unlike the general Documents feature (a denylist — any business document may be stored), these files are about to be sent OUT
 * by email, where mail gateways are strict, so this feature uses a small ALLOWLIST and checks the real file contents (signature)
 * rather than trusting the file name or the browser-reported MIME type.
 */

export const INVOICE_REQUEST_ATTACHMENT_LIMITS = {
  maxFiles: 5,
  maxFileBytes: 10 * 1024 * 1024,
  maxTotalBytes: 20 * 1024 * 1024,
} as const;

const OLE = [0xd0, 0xcf, 0x11, 0xe0]; // legacy .doc / .xls / .ppt (OLE Compound File)
const ZIP = [0x50, 0x4b, 0x03, 0x04]; // .docx / .xlsx / .pptx (Open XML = Zip)

type AllowedType = { contentType: string; signature?: number[]; zipMarker?: string; text?: true; label: string };

/** extension -> the ONLY content type this feature will ever attach for it (the browser-supplied MIME type is never used). */
export const ALLOWED_ATTACHMENT_TYPES: Record<string, AllowedType> = {
  ".pdf": { contentType: "application/pdf", signature: [0x25, 0x50, 0x44, 0x46], label: "PDF" },
  ".doc": { contentType: "application/msword", signature: OLE, label: "DOC" },
  ".docx": { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", signature: ZIP, zipMarker: "word/", label: "DOCX" },
  ".xls": { contentType: "application/vnd.ms-excel", signature: OLE, label: "XLS" },
  ".xlsx": { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", signature: ZIP, zipMarker: "xl/", label: "XLSX" },
  ".ppt": { contentType: "application/vnd.ms-powerpoint", signature: OLE, label: "PPT" },
  ".pptx": { contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", signature: ZIP, zipMarker: "ppt/", label: "PPTX" },
  ".png": { contentType: "image/png", signature: [0x89, 0x50, 0x4e, 0x47], label: "PNG" },
  ".jpg": { contentType: "image/jpeg", signature: [0xff, 0xd8, 0xff], label: "JPG" },
  ".jpeg": { contentType: "image/jpeg", signature: [0xff, 0xd8, 0xff], label: "JPEG" },
  ".csv": { contentType: "text/csv", text: true, label: "CSV" },
  ".txt": { contentType: "text/plain", text: true, label: "TXT" },
};

export const ALLOWED_ATTACHMENT_LABELS = "PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, CSV, TXT, PNG, JPG, JPEG";

/** Binary formats that must never hide behind a .csv/.txt name. */
const FORBIDDEN_TEXT_SIGNATURES: number[][] = [
  [0x4d, 0x5a], // MZ — Windows executable / DLL
  [0x7f, 0x45, 0x4c, 0x46], // ELF
  [0x50, 0x4b, 0x03, 0x04], // Zip (also jar / office)
  [0x25, 0x50, 0x44, 0x46], // %PDF
  OLE,
  [0x89, 0x50, 0x4e, 0x47], // PNG
  [0xff, 0xd8, 0xff], // JPEG
  [0x47, 0x49, 0x46, 0x38], // GIF
];

export interface UploadedAttachment {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface ValidatedAttachment {
  /** Safe, de-duplicated display / attachment name. */
  fileName: string;
  /** From the extension allowlist — never the client-supplied value. */
  contentType: string;
  size: number;
  buffer: Buffer;
}

/** Busboy decodes the multipart filename as latin1; a browser sends UTF-8. Undo that so "Rapport – été.pdf" is not stored as mojibake. */
function repairFileNameEncoding(raw: string): string {
  if (/[^\u0000-ÿ]/.test(raw)) return raw; // already real Unicode
  const decoded = Buffer.from(raw, "latin1").toString("utf8");
  return decoded.includes("�") ? raw : decoded;
}

const MAX_FILE_NAME_LENGTH = 120;

/**
 * A file name that is safe to store as metadata, show in an email and use as an attachment name: base name only (no directories),
 * no control or bidirectional-override characters, no characters that are special in headers or file systems, no leading dots, a
 * bounded length that keeps the extension. Returns "" when nothing usable remains.
 */
export function sanitizeAttachmentFileName(raw: string): string {
  let name = repairFileNameEncoding(raw).normalize("NFC");
  name = name.split(/[\\/]/).pop() ?? "";
  name = name.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, "");
  name = name.replace(/[<>:"|?*]/g, "_");
  name = name.replace(/\s+/g, " ").trim().replace(/^\.+/, "").trim();
  if (name.length > MAX_FILE_NAME_LENGTH) {
    const ext = path.extname(name);
    name = name.slice(0, MAX_FILE_NAME_LENGTH - ext.length) + ext;
  }
  const stem = name.slice(0, name.length - path.extname(name).length).trim();
  return stem ? name : "";
}

/** "a.pdf", "a.pdf" -> "a.pdf", "a (2).pdf" (case-insensitive), so two attachments never share one name in the email. */
function makeUniqueName(name: string, taken: Set<string>): string {
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  let candidate = name;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${stem} (${n})${ext}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

function assertContentsMatch(displayName: string, type: AllowedType, buffer: Buffer): void {
  const mismatch = () =>
    new AppError(`"${displayName}" does not look like a real ${type.label} file (its contents do not match its type), so it was rejected.`, 400);

  if (type.text) {
    if (FORBIDDEN_TEXT_SIGNATURES.some((sig) => matchesSignature(buffer, sig))) throw mismatch();
    const utf16Bom = (buffer[0] === 0xff && buffer[1] === 0xfe) || (buffer[0] === 0xfe && buffer[1] === 0xff);
    if (!utf16Bom && buffer.subarray(0, 65536).includes(0)) throw mismatch(); // binary data posing as text
    return;
  }
  if (!type.signature || !matchesSignature(buffer, type.signature)) throw mismatch();
  // Open XML files are Zips; a plain zip (or a renamed archive) must not pass as a Word/Excel/PowerPoint document.
  if (type.zipMarker && !(buffer.includes("[Content_Types].xml") && buffer.includes(type.zipMarker))) throw mismatch();
}

/**
 * Validates every file BEFORE anything is written or stored (all-or-nothing): count, name, allowed type, empty, size, blocked MIME,
 * real contents, total size. Throws AppError(400/413) with a message the user can act on. Returns the validated, renamed files.
 */
export function validateAttachmentFiles(files: readonly UploadedAttachment[]): ValidatedAttachment[] {
  const limits = INVOICE_REQUEST_ATTACHMENT_LIMITS;
  if (files.length > limits.maxFiles) {
    throw new AppError(`You can attach at most ${limits.maxFiles} files to one request.`, 400);
  }

  const taken = new Set<string>();
  const result: ValidatedAttachment[] = [];
  let total = 0;

  for (const file of files) {
    const cleaned = sanitizeAttachmentFileName(file.originalname);
    const shown = cleaned || "(unnamed file)";
    if (!cleaned) throw new AppError("One of the files has no usable file name. Rename it and try again.", 400);

    const ext = path.extname(cleaned).toLowerCase();
    const type = ALLOWED_ATTACHMENT_TYPES[ext];
    if (!type) {
      throw new AppError(`"${shown}" is not an allowed file type. Allowed types: ${ALLOWED_ATTACHMENT_LABELS}.`, 400);
    }
    if (BLOCKED_MIME_TYPES.has(file.mimetype)) {
      throw new AppError(`"${shown}" is not an allowed file type. Allowed types: ${ALLOWED_ATTACHMENT_LABELS}.`, 400);
    }
    if (file.size === 0 || file.buffer.length === 0) {
      throw new AppError(`"${shown}" is empty. Empty files cannot be attached.`, 400);
    }
    if (file.size > limits.maxFileBytes) {
      throw new AppError(`"${shown}" is larger than ${limits.maxFileBytes / (1024 * 1024)} MB.`, 413);
    }
    assertContentsMatch(shown, type, file.buffer);

    total += file.size;
    result.push({ fileName: makeUniqueName(cleaned, taken), contentType: type.contentType, size: file.size, buffer: file.buffer });
  }

  if (total > limits.maxTotalBytes) {
    throw new AppError(`The attachments total more than ${limits.maxTotalBytes / (1024 * 1024)} MB. Remove some files and try again.`, 413);
  }
  return result;
}

/** "340 KB" / "2.4 MB" — for the email's attachment list. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Size of ONE attachment once Nodemailer has MIME-encoded it: base64 grows data by 4/3, lines are wrapped at 76 characters with
 * CRLF, plus the part's own headers. This (not the raw file size) is what a mail server's message limit is checked against.
 */
export function estimateEncodedAttachmentBytes(rawBytes: number): number {
  const base64 = Math.ceil(rawBytes / 3) * 4;
  const lineBreaks = Math.ceil(base64 / 76) * 2;
  const partHeaders = 512;
  return base64 + lineBreaks + partHeaders;
}

const MESSAGE_ENVELOPE_OVERHEAD_BYTES = 16 * 1024; // top-level headers, recipient lists, boundary lines

/** Estimated size of the whole message as it crosses SMTP: HTML body (+ the automatic text part Nodemailer may add) + every encoded attachment. */
export function estimateEmailBytes(attachmentRawSizes: readonly number[], htmlBytes: number): number {
  return (
    MESSAGE_ENVELOPE_OVERHEAD_BYTES +
    Math.ceil(htmlBytes * 1.4) +
    attachmentRawSizes.reduce((sum, size) => sum + estimateEncodedAttachmentBytes(size), 0)
  );
}

/** True when the encoded message stays within the configured safe ceiling (see INVOICE_REQUEST_EMAIL_MAX_MB in env.ts). */
export function fitsEmailLimit(attachmentRawSizes: readonly number[], htmlBytes: number, maxEmailBytes: number): boolean {
  return estimateEmailBytes(attachmentRawSizes, htmlBytes) <= maxEmailBytes;
}

/** Recorded on InvoiceRequest.emailStatus — see schema.prisma. */
export const INVOICE_REQUEST_EMAIL_STATUS = {
  pending: "pending",
  sent: "sent",
  sentWithAttachments: "sent_with_attachments",
  sentWithoutAttachments: "sent_without_attachments",
  failed: "failed",
  unconfirmed: "unconfirmed",
} as const;
export type InvoiceRequestEmailStatus = (typeof INVOICE_REQUEST_EMAIL_STATUS)[keyof typeof INVOICE_REQUEST_EMAIL_STATUS];
