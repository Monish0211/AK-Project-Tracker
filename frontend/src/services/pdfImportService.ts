import type { PdfImportResponse } from "../types/PdfImport";
import { extractPdfImportResponse } from "./pdfExtraction";

// =============================================================================
// PDF IMPORT — real client-side extraction (pdfjs-dist + tesseract.js OCR fallback)
// =============================================================================
// This file is the ONLY place that knows extraction currently runs entirely
// in the browser instead of on a backend. Every caller (ImportPdfModal) only
// ever sees `uploadAndExtractPdf()`'s public signature — a File in, a
// Promise<PdfImportResponse> out, with progress callbacks along the way. If
// a backend extraction endpoint is ever added, this function's body becomes
// a multipart upload (e.g. `apiClient.postFormData<PdfImportResponse>("/pdf-import/extract", file, onProgress)`)
// and nothing calling it needs to change.

export const MAX_PDF_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB, matching the spec'd upload limit — the same limit a real backend endpoint would enforce.

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

/** Returns a user-facing error message, or null if the file is acceptable to upload. Shared by UploadZone's drag-and-drop and browse-file paths so both reject the same way. */
export function validateUploadFile(file: File): string | null {
  if (!isPdfFile(file)) {
    return "Only PDF files are supported.";
  }
  if (file.size > MAX_PDF_FILE_SIZE_BYTES) {
    return "File exceeds the 20MB maximum size limit.";
  }
  if (file.size === 0) {
    return "This file is empty and cannot be imported.";
  }
  return null;
}

export type PdfImportProgressStage = "uploading" | "processing";

export interface PdfImportProgressEvent {
  stage: PdfImportProgressStage;
  percent: number;
}

/**
 * Runs the real client-side extraction pipeline (pdfReader → OCR fallback →
 * Rule Engine). Rejects with a typed, meaningful error message
 * (pdfExtractionErrors.ts) for encrypted/corrupted/unsupported/empty/
 * too-slow documents, and with validateUploadFile()'s message for a file
 * that fails basic client-side checks before extraction ever starts.
 */
export async function uploadAndExtractPdf(
  file: File,
  onProgress?: (event: PdfImportProgressEvent) => void
): Promise<PdfImportResponse> {
  const validationError = validateUploadFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  return extractPdfImportResponse(file, onProgress);
}
