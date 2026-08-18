import { AppError } from "../../../shared/utils/AppError.js";
import { env } from "../../../shared/utils/env.js";

/**
 * Server-side PDF validation for the Claude AI-assist upload — independent
 * of whatever the browser's own MAX_PDF_FILE_SIZE_BYTES check already did
 * (frontend/src/services/pdfImportService.ts), since a client-side check
 * can never be trusted alone. Mirrors excelParser.service.ts's
 * validateAttachment() style: plain throws, no return value.
 *
 * Page-count enforcement (the 50-page cap named in the approved plan) is
 * NOT implemented here yet — it requires a PDF-parsing library capable of
 * reading page count, and no such library exists in Backend/package.json
 * today (only @anthropic-ai/sdk was authorized for this implementation
 * pass). This is a deliberate, flagged gap, not an oversight — adding one
 * is a separate decision, not silently made here.
 */

const PDF_MAGIC_BYTES = Buffer.from("%PDF-", "utf-8");

export function validatePdfUpload(file: Express.Multer.File | undefined): void {
  if (!file) {
    throw new AppError("A PDF file is required (field name: file).", 400);
  }

  if (!file.buffer || file.buffer.length === 0) {
    throw new AppError("Uploaded PDF is empty.", 400);
  }

  const maxBytes = env.PDF_IMPORT_AI_MAX_FILE_SIZE_MB * 1024 * 1024;
  if (file.buffer.length > maxBytes) {
    throw new AppError(`PDF exceeds the maximum allowed size of ${env.PDF_IMPORT_AI_MAX_FILE_SIZE_MB}MB.`, 400);
  }

  // Magic-byte check — deliberately not trusting file.mimetype or the
  // original filename's extension, both of which are client-supplied and
  // can be spoofed.
  const header = file.buffer.subarray(0, PDF_MAGIC_BYTES.length);
  if (!header.equals(PDF_MAGIC_BYTES)) {
    throw new AppError("Uploaded file is not a valid PDF.", 400);
  }
}

/**
 * Multi-document cross-verification — validates every file in a document
 * set the same way validatePdfUpload() always has (reused per file, not
 * reimplemented), PLUS the two constraints that only exist once more than
 * one file can land in a single Claude request: a combined size ceiling
 * (base64 inflates raw bytes ~37%, and Anthropic's own request-size limit
 * is a hard external constraint PDF_IMPORT_AI_MAX_FILE_SIZE_MB alone never
 * protected against) and a document-count ceiling. See env.ts's own
 * comment on PDF_IMPORT_AI_MAX_DOCUMENT_SET_MB/
 * PDF_IMPORT_AI_MAX_DOCUMENTS_PER_SET for the reasoning behind both.
 */
export function validatePdfDocumentSet(files: Express.Multer.File[] | undefined): void {
  if (!files || files.length === 0) {
    throw new AppError("At least one PDF file is required (field name: files).", 400);
  }

  if (files.length > env.PDF_IMPORT_AI_MAX_DOCUMENTS_PER_SET) {
    throw new AppError(
      `A document set can contain at most ${env.PDF_IMPORT_AI_MAX_DOCUMENTS_PER_SET} PDFs for Claude cross-verification.`,
      400
    );
  }

  for (const file of files) {
    validatePdfUpload(file);
  }

  const totalBytes = files.reduce((sum, file) => sum + file.buffer.length, 0);
  const maxTotalBytes = env.PDF_IMPORT_AI_MAX_DOCUMENT_SET_MB * 1024 * 1024;
  if (totalBytes > maxTotalBytes) {
    throw new AppError(
      `This document set's combined size exceeds the ${env.PDF_IMPORT_AI_MAX_DOCUMENT_SET_MB}MB limit for Claude cross-verification.`,
      400
    );
  }
}
