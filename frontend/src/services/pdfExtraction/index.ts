import type { PdfImportResponse, PdfImportWarning } from "../../types/PdfImport";
import { MAX_PAGES_PROCESSED, readPdfPages, renderPageToCanvas } from "./pdfReader";
import { recognizeCanvas } from "./ocrEngine";
import { PdfExtractionTimeoutError } from "./pdfExtractionErrors";
import { extractFields } from "./ruleEngine/extractor";
import { buildPdfImportResponse } from "./ruleEngine/responseBuilder";

/**
 * The real extraction pipeline: Upload → read PDF (pdfjs-dist) → per-page
 * digital text, OCR fallback only for pages that need it (tesseract.js) →
 * merge page text → Rule Engine (Extractor → Normalizer → responseBuilder)
 * → PdfImportResponse. This is the ONLY function pdfImportService.ts calls
 * to replace the old mock — its signature (File in, PdfImportProgressEvent
 * callback, Promise<PdfImportResponse> out) intentionally matches the mock
 * it replaces so nothing downstream (ImportPdfModal.tsx, the Preview
 * screen, the Mapper, Apply) needs to change at all.
 */

export type PdfExtractionProgressStage = "uploading" | "processing";

export interface PdfExtractionProgressEvent {
  stage: PdfExtractionProgressStage;
  percent: number;
}

const OVERALL_TIMEOUT_MS = 120_000;

function withOverallTimeout<T>(work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new PdfExtractionTimeoutError()), OVERALL_TIMEOUT_MS);
    work
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function runExtraction(
  file: File,
  onProgress?: (event: PdfExtractionProgressEvent) => void
): Promise<PdfImportResponse> {
  onProgress?.({ stage: "uploading", percent: 100 });

  const pipelineWarnings: PdfImportWarning[] = [];

  const { result, pdfDocument, pagesNeedingOcr } = await readPdfPages(file, (pagesDone, totalPages) => {
    onProgress?.({ stage: "processing", percent: Math.round((pagesDone / totalPages) * 50) });
  });

  if (result.truncated) {
    pipelineWarnings.push({
      field: "document",
      message: `This PDF has ${result.totalPageCount} pages; only the first ${MAX_PAGES_PROCESSED} were processed.`,
      severity: "warning",
    });
  }

  const pages = [...result.pages];

  if (pagesNeedingOcr.length === 0) {
    onProgress?.({ stage: "processing", percent: 100 });
  } else {
    pipelineWarnings.push({
      field: "document",
      message: `${pagesNeedingOcr.length} page(s) had little or no digital text and were read using OCR — OCR results may be less accurate than digital text.`,
      severity: "info",
    });

    for (let i = 0; i < pagesNeedingOcr.length; i++) {
      const pageNumber = pagesNeedingOcr[i];
      try {
        const canvas = await renderPageToCanvas(pdfDocument, pageNumber);
        const ocrResult = await recognizeCanvas(canvas);
        const pageIndex = pages.findIndex((p) => p.pageNumber === pageNumber);
        if (pageIndex >= 0) {
          pages[pageIndex] = { ...pages[pageIndex], text: ocrResult.text, ocrConfidence: ocrResult.confidence };
        }
      } catch {
        // Never abort the whole document over one unreadable scanned page.
        pipelineWarnings.push({
          field: "document",
          message: `Page ${pageNumber} could not be read using OCR and was skipped.`,
          severity: "warning",
        });
      }
      onProgress?.({ stage: "processing", percent: 50 + Math.round(((i + 1) / pagesNeedingOcr.length) * 50) });
    }
  }

  const orderedPages = pages.slice().sort((a, b) => a.pageNumber - b.pageNumber);
  const hasAnyText = orderedPages.some((p) => p.text.trim().length > 0);

  if (!hasAnyText) {
    pipelineWarnings.push({
      field: "document",
      message: "No readable text could be extracted from this document — all fields will need to be entered manually.",
      severity: "error",
    });
  }

  const extractedFields = extractFields(orderedPages.map((p) => ({ pageNumber: p.pageNumber, text: p.text })));
  return buildPdfImportResponse({ fileName: file.name, extracted: extractedFields, pipelineWarnings });
}

export function extractPdfImportResponse(
  file: File,
  onProgress?: (event: PdfExtractionProgressEvent) => void
): Promise<PdfImportResponse> {
  return withOverallTimeout(runExtraction(file, onProgress));
}
