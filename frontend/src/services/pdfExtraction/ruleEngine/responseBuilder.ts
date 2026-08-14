import type { PdfImportResponse, PdfImportUnmappedField, PdfImportWarning } from "../../../types/PdfImport";
import type { ExtractedFields } from "./extractor";
import { normalizeGeneralInformation, normalizeMilestones, normalizeQuantityRows } from "./normalizer";

/**
 * STAGE 3 — assembles the final PdfImportResponse from Stage 2's normalized
 * fields. Deliberately named "responseBuilder", NOT "mapper" — the existing,
 * untouched pdfImportMapper.ts is a completely different transformation
 * (PdfImportResponse → Project) and is the ONLY place allowed to produce
 * Project-shaped data. This file never imports the Project type and never
 * imports pdfImportMapper.ts.
 *
 * Required-field / low-confidence / milestone-sum / missing-quantity
 * warnings are already handled by the existing, untouched
 * pdfImportValidator.ts, which ImportPdfModal.tsx calls separately and
 * merges with response.warnings — so this file only ever adds
 * extraction-*process* warnings (pipeline-level: OCR fallback used, pages
 * truncated, a value found but deliberately not auto-filled), never
 * duplicates what the validator already covers.
 */

export interface ResponseBuilderInput {
  fileName: string;
  extracted: ExtractedFields;
  /** Process-level warnings from the orchestrator (OCR usage, page truncation, per-page OCR failures) — see pdfExtraction/index.ts. */
  pipelineWarnings: PdfImportWarning[];
}

function buildUnmappedFields(extracted: ExtractedFields): PdfImportUnmappedField[] {
  const unmapped: PdfImportUnmappedField[] = [];

  if (extracted.poNumber.value) {
    unmapped.push({
      label: "PO Number",
      rawValue: extracted.poNumber.value,
      reason: "PO Number is always entered manually and is never auto-filled from a PDF, per business rule.",
    });
  }

  if (extracted.remarks.value) {
    unmapped.push({
      label: "Remarks",
      rawValue: extracted.remarks.value,
      reason: "Remarks has no equivalent field in General Information, Quantity, or Payment Milestones.",
    });
  }

  return unmapped;
}

function averageConfidence(fields: Array<{ confidence: number }>): number {
  if (fields.length === 0) return 0;
  return Math.round(fields.reduce((sum, f) => sum + f.confidence, 0) / fields.length);
}

export function buildPdfImportResponse(input: ResponseBuilderInput): PdfImportResponse {
  const { fileName, extracted, pipelineWarnings } = input;

  const generalInformation = normalizeGeneralInformation(extracted);
  const quantity = normalizeQuantityRows(extracted.quantityRows);
  const milestones = normalizeMilestones(extracted.milestones);

  const paymentMilestones = {
    paymentType: {
      value: (milestones.length > 1 ? "Multiple" : "Single") as "Single" | "Multiple",
      confidence: milestones.length > 0 ? 70 : 0,
    },
    milestones,
  };

  const unmappedFields = buildUnmappedFields(extracted);
  const warnings: PdfImportWarning[] = [...pipelineWarnings];

  warnings.push({
    field: "document",
    message:
      extracted.documentType === "Unknown"
        ? "Could not confidently identify this document's type — field mapping used generic aliases only, without a document-specific template profile."
        : `Detected document type: ${extracted.documentType}. Field aliases and section names were prioritized for this template.`,
    severity: "info",
  });

  for (const field of unmappedFields) {
    warnings.push({
      field: field.label,
      message: `${field.label} ("${field.rawValue}") was found in the document but is not auto-filled — see Unmapped Fields below.`,
      severity: "info",
    });
  }

  const overallConfidence = averageConfidence([
    ...Object.values(generalInformation),
    ...quantity.flatMap((row) => Object.values(row)),
  ]);

  return {
    fileName,
    generalInformation,
    quantity,
    paymentMilestones,
    warnings,
    unmappedFields,
    overallConfidence,
  };
}
