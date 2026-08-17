import type { PdfImportResponse } from "../types/PdfImport";
import { extractPdfImportResponse } from "./pdfExtraction";
import { apiClient } from "./apiClient";
import { shouldRequestAiExtraction } from "./pdfImportAiTrigger";
import { mergeWithAiCandidate, type PdfImportAiCandidate } from "../utils/pdfImportMerge";

// =============================================================================
// PDF IMPORT — real client-side extraction (pdfjs-dist + tesseract.js OCR fallback)
// + optional backend Claude AI-assist supplement
// =============================================================================
// Client-side extraction (pdfReader → OCR fallback → Rule Engine) remains
// the primary, always-run, free path — completely unchanged below. When the
// rule engine's own result signals it needs help (shouldRequestAiExtraction,
// per Stage 3 §8), this function additionally calls the backend's
// POST /pdf-import/ai-extract and merges the result (mergeWithAiCandidate,
// Stage 3 §11) — never silently overwriting a rule-engine value. ANY
// failure in the AI leg (unconfigured, network error, timeout, malformed
// response, rate limited) falls back to the plain rule-engine result — the
// existing feature must never be made worse by this optional supplement
// failing (Stage 3 §17). Every caller (ImportPdfModal) still only ever sees
// this function's original public signature — a File in, a
// Promise<PdfImportResponse> out, with progress callbacks along the way —
// so nothing calling it needs to change.

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

export type PdfImportProgressStage = "uploading" | "processing" | "ai-enhancing";

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

  const ruleEngineResult = await extractPdfImportResponse(file, onProgress);

  if (!shouldRequestAiExtraction(ruleEngineResult)) {
    return ruleEngineResult;
  }

  try {
    onProgress?.({ stage: "ai-enhancing", percent: 0 });
    const formData = new FormData();
    formData.append("file", file);
    const aiCandidate = await apiClient.postFormData<PdfImportAiCandidate>("/pdf-import/ai-extract", formData);
    onProgress?.({ stage: "ai-enhancing", percent: 100 });
    return mergeWithAiCandidate(ruleEngineResult, aiCandidate);
  } catch {
    // Claude unavailable/misconfigured/network error/timeout/rate-limited/
    // malformed response — every failure mode falls back to the plain
    // rule-engine result. See header comment above; this catch block IS
    // the fallback mechanism (Stage 3 §17).
    return ruleEngineResult;
  }
}
