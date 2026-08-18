import type { PdfImportResponse } from "../types/PdfImport";
import { extractPdfImportResponse } from "./pdfExtraction";
import { apiClient } from "./apiClient";
import { mergeWithAiCandidate, type PdfImportAiCandidate } from "../utils/pdfImportMerge";

// =============================================================================
// PDF IMPORT — real client-side extraction (pdfjs-dist + tesseract.js OCR fallback)
// + optional, EXPLICIT backend Claude AI-assist supplement, for one or many files
// =============================================================================
// Client-side extraction (pdfReader → OCR fallback → Rule Engine) remains the
// primary, always-run, free path for every file — completely unchanged below.
// Claude is called ONLY when the caller explicitly passes useClaude:true (the
// PDF Import modal's "Use Claude AI for enhanced extraction" checkbox, default
// OFF) — never automatically based on OCR/rule-engine confidence. When
// useClaude is false, extractPdfFilesSequentially() never imports, calls, or
// awaits anything Claude-related for that file: zero backend requests.
//
// Multiple files are processed strictly ONE AT A TIME (never in parallel) —
// this is deliberate, not an oversight: a single multipart request per file
// keeps backend memory bounded regardless of batch size, and sequential
// Claude calls (at most one in flight at a time) avoids ever sending
// concurrent requests to the Claude endpoint or its rate limiter. A failure
// on any one file (invalid PDF, Claude unavailable, OCR error) is caught and
// recorded for that file only — it never stops the remaining files in the
// batch.

export const MAX_PDF_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB per file — the same limit the backend endpoint enforces (PDF_IMPORT_AI_MAX_FILE_SIZE_MB).
export const MAX_PDF_FILE_COUNT = 20;

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

/** Returns a user-facing error message if adding `newFiles` to `existingCount` already-selected files would exceed the 20-file cap, or null if the total is acceptable. */
export function validateFileCount(existingCount: number, newFilesCount: number): string | null {
  if (existingCount + newFilesCount > MAX_PDF_FILE_COUNT) {
    return `You can select up to ${MAX_PDF_FILE_COUNT} PDF files at a time.`;
  }
  return null;
}

export type PdfImportProgressStage = "uploading" | "processing" | "ai-enhancing";

export interface PdfImportProgressEvent {
  stage: PdfImportProgressStage;
  percent: number;
}

/** Per-file progress, for the multi-file batch progress UI ("Processing PDF 2 of 5 — filename — OCR extraction…"). */
export interface PdfBatchProgressEvent extends PdfImportProgressEvent {
  fileIndex: number;
  totalFiles: number;
  fileName: string;
}

export type PdfBatchFileStatus = "success" | "invalid" | "failed";

export interface PdfBatchFileResult {
  /** Stable, index-based key for React lists — not a random ID, since this is deterministic per batch run. */
  id: string;
  file: File;
  status: PdfBatchFileStatus;
  /** Present only when status === "success". */
  response?: PdfImportResponse;
  /** Present when status is "invalid" or "failed" — a user-facing reason. */
  errorMessage?: string;
  /** True only when useClaude was on for this batch but Claude itself failed for THIS file specifically — the rule-engine result was used instead. Distinct from status, since the file still succeeded overall. */
  aiFallbackUsed?: boolean;
}

/**
 * Runs the existing client-side extraction pipeline for a single file, then
 * — only if useClaude is true — calls the backend Claude endpoint and
 * merges the result. ANY Claude-leg failure (unconfigured, network,
 * timeout, rate-limited, malformed response) falls back to the plain
 * rule-engine result for this file; it never throws past this point.
 */
async function extractSingleFile(
  file: File,
  useClaude: boolean,
  onProgress: (event: PdfImportProgressEvent) => void
): Promise<{ response: PdfImportResponse; aiFallbackUsed: boolean }> {
  const ruleEngineResult = await extractPdfImportResponse(file, onProgress);

  if (!useClaude) {
    return { response: ruleEngineResult, aiFallbackUsed: false };
  }

  try {
    onProgress({ stage: "ai-enhancing", percent: 0 });
    const formData = new FormData();
    formData.append("file", file);
    const aiCandidate = await apiClient.postFormData<PdfImportAiCandidate>("/pdf-import/ai-extract", formData);
    onProgress({ stage: "ai-enhancing", percent: 100 });
    return { response: mergeWithAiCandidate(ruleEngineResult, aiCandidate), aiFallbackUsed: false };
  } catch {
    // Claude unavailable/misconfigured/network error/timeout/rate-limited/
    // malformed response — every failure mode falls back to the plain
    // rule-engine result for this one file. The batch as a whole, and every
    // other file in it, is entirely unaffected.
    return { response: ruleEngineResult, aiFallbackUsed: true };
  }
}

/**
 * Processes every selected file strictly sequentially (never Promise.all —
 * see header comment). One bad or Claude-failing file never stops the rest:
 * each file's outcome is recorded independently in the returned array, in
 * the same order the files were selected.
 */
export async function extractPdfFilesSequentially(
  files: File[],
  useClaude: boolean,
  onProgress: (event: PdfBatchProgressEvent) => void
): Promise<PdfBatchFileResult[]> {
  const results: PdfBatchFileResult[] = [];

  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const id = `${index}-${file.name}-${file.size}`;

    const validationError = validateUploadFile(file);
    if (validationError) {
      results.push({ id, file, status: "invalid", errorMessage: validationError });
      continue;
    }

    try {
      const { response, aiFallbackUsed } = await extractSingleFile(file, useClaude, (event) =>
        onProgress({ ...event, fileIndex: index, totalFiles: files.length, fileName: file.name })
      );
      results.push({ id, file, status: "success", response, aiFallbackUsed });
    } catch (err) {
      results.push({
        id,
        file,
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "Failed to extract data from this document. Please try again.",
      });
    }
  }

  return results;
}
