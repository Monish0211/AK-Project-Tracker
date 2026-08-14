import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy, TextItem } from "pdfjs-dist/types/src/display/api";
// Vite-native worker URL import — the one correct way to point pdfjs-dist
// at its worker script from a bundler without a manual copy-to-public step.
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { CorruptedPdfError, EmptyPdfError, EncryptedPdfError, UnsupportedPdfError } from "./pdfExtractionErrors";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

/** Hard cap on pages processed — protects the browser tab from a pathological (hundreds of scanned pages) OCR run. Extra pages are dropped with a warning surfaced by responseBuilder.ts, never silently. */
export const MAX_PAGES_PROCESSED = 50;

/** Below this many non-whitespace characters, a page is treated as having no usable digital text and is sent to OCR instead. A heuristic, not a precise classifier — see readPdfPages()'s own comment. */
const OCR_TRIGGER_CHAR_THRESHOLD = 40;

/** Render scale used only for the OCR fallback path — higher than 1:1 improves Tesseract's accuracy at a real time cost, so this is a deliberate quality/speed tradeoff, not left at the library default. */
const OCR_RENDER_SCALE = 2;

export interface PdfPageContent {
  pageNumber: number;
  text: string;
  source: "digital" | "ocr";
  /** Only set for OCR pages — Tesseract's own recognition confidence (0-100) for that page's image, independent of the Rule Engine's own per-field confidence scoring. */
  ocrConfidence?: number;
}

export interface PdfReadResult {
  pages: PdfPageContent[];
  totalPageCount: number;
  truncated: boolean;
}

/**
 * A horizontal gap this wide (in PDF points) between two text fragments on
 * the same line is treated as a table/form column boundary rather than an
 * ordinary word space — normal word spacing in body text rarely exceeds a
 * few points, while a real column gap (the empty cell padding between
 * "Client" and its value in a bordered table) is reliably much wider. An
 * approximation, not a precise table-structure classifier — see the
 * contextMatcher's own "table-match" strategy for how this gets used.
 */
const TABLE_COLUMN_GAP_THRESHOLD = 12;

/**
 * Reconstructs a page's text with real line breaks by grouping text items
 * by their vertical position — pdfjs-dist's raw getTextContent() otherwise
 * returns a flat list of fragments with no line structure, which the Field
 * Mapping Engine needs to work at all. A wide horizontal gap between two
 * fragments on the same line is preserved as a literal tab character rather
 * than collapsed to a single space, so a reconstructed line like
 * "Client\tM/s. Indian Oil Corporation Limited" can be told apart from
 * ordinary prose — the tab is what lets contextMatcher's table-cell
 * strategy recognize a bordered label/value table cell pair.
 */
function reconstructPageText(items: TextItem[]): string {
  const lines = new Map<number, TextItem[]>();

  for (const item of items) {
    if (!("str" in item) || !item.str.trim()) continue;
    // transform[5] is the item's baseline Y position; rounding merges
    // fragments that are on the same visual line but not bit-for-bit equal.
    const y = Math.round(item.transform[5]);
    const bucket = lines.get(y) ?? [];
    bucket.push(item);
    lines.set(y, bucket);
  }

  const orderedYs = Array.from(lines.keys()).sort((a, b) => b - a); // top of page first
  return orderedYs
    .map((y) => {
      const sorted = lines
        .get(y)!
        .sort((a, b) => a.transform[4] - b.transform[4]); // left to right

      let line = "";
      let previousEndX: number | null = null;
      for (const item of sorted) {
        const startX = item.transform[4];
        if (previousEndX !== null) {
          const gap = startX - previousEndX;
          line += gap >= TABLE_COLUMN_GAP_THRESHOLD ? "\t" : " ";
        }
        line += item.str;
        previousEndX = startX + (item.width ?? 0);
      }

      return line.replace(/[ \t]+\n/g, "\n").replace(/ {2,}/g, " ").trim();
    })
    .filter((line) => line.length > 0)
    .join("\n");
}

async function loadDocument(file: File): Promise<PDFDocumentProxy> {
  const arrayBuffer = await file.arrayBuffer();
  try {
    return await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name === "PasswordException") {
      throw new EncryptedPdfError();
    }
    if (name === "InvalidPDFException") {
      throw new CorruptedPdfError();
    }
    throw new UnsupportedPdfError(error instanceof Error ? error.message : "Unknown error while opening the file.");
  }
}

/**
 * Extracts per-page digital text via pdfjs-dist. Pages whose reconstructed
 * text falls under OCR_TRIGGER_CHAR_THRESHOLD are returned with empty text
 * and `needsOcr: true` for the caller (pdfExtraction/index.ts) to run
 * through Tesseract instead — this file never imports the OCR engine
 * itself, keeping "which pages need OCR" and "how OCR actually runs" as
 * two separate, independently testable concerns.
 */
export async function readPdfPages(
  file: File,
  onPageRead?: (pagesDone: number, totalPages: number) => void
): Promise<{ result: PdfReadResult; pdfDocument: PDFDocumentProxy; pagesNeedingOcr: number[] }> {
  const pdfDocument = await loadDocument(file);
  const totalPageCount = pdfDocument.numPages;

  if (totalPageCount === 0) {
    throw new EmptyPdfError();
  }

  const truncated = totalPageCount > MAX_PAGES_PROCESSED;
  const pagesToProcess = Math.min(totalPageCount, MAX_PAGES_PROCESSED);

  const pages: PdfPageContent[] = [];
  const pagesNeedingOcr: number[] = [];

  for (let pageNumber = 1; pageNumber <= pagesToProcess; pageNumber++) {
    const page = await pdfDocument.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const text = reconstructPageText(textContent.items as TextItem[]);

    if (text.replace(/\s/g, "").length < OCR_TRIGGER_CHAR_THRESHOLD) {
      pages.push({ pageNumber, text: "", source: "ocr" });
      pagesNeedingOcr.push(pageNumber);
    } else {
      pages.push({ pageNumber, text, source: "digital" });
    }

    onPageRead?.(pageNumber, pagesToProcess);
  }

  return { result: { pages, totalPageCount, truncated }, pdfDocument, pagesNeedingOcr };
}

/** Renders one page to an in-memory canvas — used only for pages readPdfPages() flagged as needing OCR. Kept separate so the digital-text pass above never pays this cost for pages that don't need it. */
export async function renderPageToCanvas(pdfDocument: PDFDocumentProxy, pageNumber: number): Promise<HTMLCanvasElement> {
  const page = await pdfDocument.getPage(pageNumber);
  const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new UnsupportedPdfError("Could not prepare this page for OCR (no 2D canvas context available).");
  }

  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return canvas;
}
