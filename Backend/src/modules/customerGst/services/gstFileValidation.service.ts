import { AppError } from "../../../shared/utils/AppError.js";
import { env } from "../../../shared/utils/env.js";
import { MAGIC_BYTE_SIGNATURES, matchesSignature } from "../../documents/documents.constants.js";

/**
 * Server-side validation for the GST Registration Document upload — reuses
 * the Documents feature's own magic-byte signature table (documents.
 * constants.ts) rather than duplicating it, per the audit's explicit
 * instruction. Documents' own check is a DENYLIST (block only executables;
 * a signature mismatch on a named format is the exception, not the rule).
 * This is deliberately an ALLOWLIST instead — GST upload accepts exactly
 * three formats, so every one of them MUST match its declared signature,
 * not just "if we happen to recognize the extension."
 */

const ALLOWED_EXTENSIONS = new Set([".pdf", ".png", ".jpg", ".jpeg"]);

export type GstDocumentKind = "pdf" | "png" | "jpeg";

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

/**
 * Never trusts file.mimetype or the filename extension alone (both are
 * client-supplied and spoofable) — returns the format ONLY after its magic
 * bytes are confirmed to match.
 */
export function validateGstDocumentUpload(file: Express.Multer.File | undefined): GstDocumentKind {
  if (!file) {
    throw new AppError("A GST Registration Document is required (field name: file).", 400);
  }

  if (!file.buffer || file.buffer.length === 0) {
    throw new AppError("Uploaded GST document is empty.", 400);
  }

  const maxBytes = env.GST_DOCUMENT_MAX_FILE_SIZE_MB * 1024 * 1024;
  if (file.buffer.length > maxBytes) {
    throw new AppError(`GST document exceeds the maximum allowed size of ${env.GST_DOCUMENT_MAX_FILE_SIZE_MB}MB.`, 400);
  }

  const ext = extensionOf(file.originalname);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new AppError("Only PDF, PNG, and JPEG files are accepted for the GST Registration Document.", 400);
  }

  const matchingSignatures = MAGIC_BYTE_SIGNATURES.filter((sig) => sig.extensions.includes(ext));
  const matched = matchingSignatures.find((sig) => matchesSignature(file.buffer, sig.signature));
  if (!matched) {
    throw new AppError("This file's contents do not match its extension and were rejected for safety.", 400);
  }

  if (ext === ".pdf") return "pdf";
  if (ext === ".png") return "png";
  return "jpeg";
}
