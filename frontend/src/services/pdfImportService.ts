import type { PdfImportResponse } from "../types/PdfImport";
import { extractPdfImportResponse } from "./pdfExtraction";
import { apiClient } from "./apiClient";
import { mergeWithAiCandidate, type PdfImportAiCandidate } from "../utils/pdfImportMerge";
import { mergeDocumentSet, type DocumentSetMember } from "../utils/pdfImportDocumentSetMerge";

// =============================================================================
// PDF IMPORT — real client-side extraction (pdfjs-dist + tesseract.js OCR fallback)
// + optional, EXPLICIT backend Claude AI-assist supplement, treating every
// uploaded file as ONE document set (multi-document cross-verification)
// =============================================================================
// Client-side extraction (pdfReader → OCR fallback → Rule Engine) remains the
// primary, always-run, free path for every file — completely unchanged below,
// still one call per file. What changed: instead of producing N independent
// results (one Review per file), every file's rule-engine result is combined
// into ONE consolidated result via mergeDocumentSet() (see
// pdfImportDocumentSetMerge.ts) — a single file is simply a document set of
// size 1, the exact same code path.
//
// Claude is called ONLY when the caller explicitly passes useClaude:true (the
// PDF Import modal's "Use Claude AI for enhanced extraction" checkbox, default
// OFF) — never automatically. When on, EVERY valid file in the set is sent to
// the backend in ONE request (not one request per file) so Claude can cross-
// check them together — see callClaudeForDocumentSet() below. When useClaude
// is false, no backend request is ever made.
//
// Rule-engine extraction still runs strictly ONE FILE AT A TIME (never in
// parallel) to keep client memory bounded regardless of batch size. A failure
// on any one file (invalid PDF, OCR error) is recorded for that file only —
// it never stops the remaining files in the set; only that file's own
// contribution to the consolidated result is missing.

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

export type PdfDocumentFileStatus = "valid" | "invalid";

/** One uploaded file's own standing within the document set — independent of whether the SET as a whole succeeded, so an invalid file is still listed to the user without blocking the other valid files from contributing. */
export interface PdfDocumentSetFile {
  /** Stable, index-based key for React lists — not a random ID, since this is deterministic per run. */
  id: string;
  file: File;
  status: PdfDocumentFileStatus;
  /** Present only when status === "invalid". */
  errorMessage?: string;
}

export type PdfDocumentSetStatus = "success" | "failed";

/**
 * The outcome of treating every selected file as ONE document set —
 * replaces the old per-file PdfBatchFileResult[]. `files` still reports
 * each individual file's own validity (for the "2/2 successfully
 * processed" file list), but there is only ONE `response` for the whole
 * set to review, never one per file.
 */
export interface PdfDocumentSetResult {
  files: PdfDocumentSetFile[];
  status: PdfDocumentSetStatus;
  /** Present only when status === "success" — the ONE consolidated result. */
  response?: PdfImportResponse;
  /** Present when status === "failed" (e.g. every selected file was invalid). */
  errorMessage?: string;
  /** True only when useClaude was on but the Claude leg failed/was skipped for the WHOLE set — the OCR/rule-engine consolidated result was used instead. Distinct from status, since the set still succeeded overall. */
  aiFallbackUsed: boolean;
}

/**
 * Sends every valid file in the set to the backend in ONE multipart
 * request (repeated "files" field — see Backend's pdfImport.routes.ts
 * upload.array("files", ...)), so Claude reads and cross-checks the whole
 * document set in a single call rather than one call per file (Option A —
 * see the approved cost/architecture reasoning: N independent Claude
 * calls plus a separate merge call was explicitly rejected).
 */
async function callClaudeForDocumentSet(files: File[]): Promise<PdfImportAiCandidate> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }
  return apiClient.postFormData<PdfImportAiCandidate>("/pdf-import/ai-extract", formData);
}

/**
 * Runs the existing client-side extraction pipeline once per valid file,
 * strictly sequentially (never Promise.all — keeps client memory bounded
 * regardless of set size), then combines every file's own result into ONE
 * consolidated PdfImportResponse via mergeDocumentSet(). If useClaude is
 * on, the whole set is additionally sent to Claude in one request and the
 * consolidated rule-engine result is merged against that ONE AI candidate
 * via the existing, unchanged mergeWithAiCandidate(). ANY Claude-leg
 * failure (unconfigured, network, timeout, rate-limited, malformed
 * response, over the document-set size/count cap) falls back to the
 * OCR/rule-engine consolidated result for the WHOLE set — it never throws
 * past this point, and never partially applies to only some files.
 */
export async function extractPdfDocumentSet(
  files: File[],
  useClaude: boolean,
  onProgress: (event: PdfBatchProgressEvent) => void
): Promise<PdfDocumentSetResult> {
  const fileStatuses: PdfDocumentSetFile[] = files.map((file, index) => {
    const id = `${index}-${file.name}-${file.size}`;
    const validationError = validateUploadFile(file);
    return validationError ? { id, file, status: "invalid", errorMessage: validationError } : { id, file, status: "valid" };
  });

  const validFiles = fileStatuses.filter((f): f is PdfDocumentSetFile & { status: "valid" } => f.status === "valid").map((f) => f.file);

  if (validFiles.length === 0) {
    return {
      files: fileStatuses,
      status: "failed",
      errorMessage: "None of the selected files could be processed.",
      aiFallbackUsed: false,
    };
  }

  try {
    const members: DocumentSetMember[] = [];
    for (let index = 0; index < validFiles.length; index++) {
      const file = validFiles[index];
      const response = await extractPdfImportResponse(file, (event) =>
        onProgress({ ...event, fileIndex: index, totalFiles: validFiles.length, fileName: file.name })
      );
      members.push({ fileName: file.name, response });
    }

    const ruleResult = mergeDocumentSet(members);

    if (!useClaude) {
      return { files: fileStatuses, status: "success", response: ruleResult, aiFallbackUsed: false };
    }

    const lastIndex = validFiles.length - 1;
    try {
      onProgress({ stage: "ai-enhancing", percent: 0, fileIndex: lastIndex, totalFiles: validFiles.length, fileName: validFiles[lastIndex].name });
      const aiCandidate = await callClaudeForDocumentSet(validFiles);
      onProgress({ stage: "ai-enhancing", percent: 100, fileIndex: lastIndex, totalFiles: validFiles.length, fileName: validFiles[lastIndex].name });
      return { files: fileStatuses, status: "success", response: mergeWithAiCandidate(ruleResult, aiCandidate), aiFallbackUsed: false };
    } catch {
      // Claude unavailable/misconfigured/network error/timeout/rate-limited/
      // malformed response/over the document-set size or count cap — every
      // failure mode falls back to the plain OCR/rule-engine consolidated
      // result for the WHOLE set, never partially.
      return { files: fileStatuses, status: "success", response: ruleResult, aiFallbackUsed: true };
    }
  } catch (err) {
    return {
      files: fileStatuses,
      status: "failed",
      errorMessage: err instanceof Error ? err.message : "Failed to extract data from the selected documents. Please try again.",
      aiFallbackUsed: false,
    };
  }
}
