/**
 * Typed errors for the real extraction pipeline — every failure mode
 * pdfImportService.ts / ImportPdfModal.tsx needs to show a meaningful
 * message for, per the explicit "always return meaningful errors"
 * requirement. ImportPdfModal.tsx's existing error stage already renders
 * `err.message` verbatim (unchanged) — these classes exist so each failure
 * mode gets a specific, honest message instead of a generic one.
 */
export class PdfExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfExtractionError";
  }
}

export class EncryptedPdfError extends PdfExtractionError {
  constructor() {
    super("This PDF is password-protected and cannot be processed. Please upload an unlocked copy.");
    this.name = "EncryptedPdfError";
  }
}

export class CorruptedPdfError extends PdfExtractionError {
  constructor() {
    super("This file could not be read as a PDF. It may be corrupted or is not a valid PDF document.");
    this.name = "CorruptedPdfError";
  }
}

export class UnsupportedPdfError extends PdfExtractionError {
  constructor(reason: string) {
    super(`This PDF could not be processed: ${reason}`);
    this.name = "UnsupportedPdfError";
  }
}

export class EmptyPdfError extends PdfExtractionError {
  constructor() {
    super("This PDF has no pages to extract data from.");
    this.name = "EmptyPdfError";
  }
}

export class PdfExtractionTimeoutError extends PdfExtractionError {
  constructor() {
    super("Extraction took too long and was stopped. Try a smaller file, or one with fewer scanned pages.");
    this.name = "PdfExtractionTimeoutError";
  }
}
