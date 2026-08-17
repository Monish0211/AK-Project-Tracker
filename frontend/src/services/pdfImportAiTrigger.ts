import type { PdfImportResponse } from "../types/PdfImport";
import { LOW_CONFIDENCE_THRESHOLD, REQUIRED_GENERAL_FIELDS } from "../utils/pdfImportValidator";

/**
 * Decides whether the Claude AI-assist supplement should be invoked,
 * reading ONLY the rule engine's own already-produced PdfImportResponse
 * (Stage 3 §8) — zero rule-engine files are modified to support this.
 *
 * The "document type Unknown" check matches the EXACT warning string
 * responseBuilder.ts always emits for that case (verified by reading that
 * file directly during Stage 4 planning) rather than adding a new field to
 * the response — this is a deliberate choice to avoid touching the rule
 * engine at all, not an oversight.
 *
 * Any OR-condition below being true triggers the AI leg; a confidently,
 * completely extracted document never reaches Claude at all.
 */

const UNKNOWN_DOCUMENT_TYPE_WARNING_SNIPPET = "Could not confidently identify this document's type";

const MAX_TOLERABLE_MISSING_REQUIRED_FIELDS = 3;

function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

export function shouldRequestAiExtraction(response: PdfImportResponse): boolean {
  try {
    const gi = response.generalInformation;

    const missingRequiredCount = REQUIRED_GENERAL_FIELDS.filter(({ key }) => isEmptyValue(gi[key].value)).length;
    if (missingRequiredCount > MAX_TOLERABLE_MISSING_REQUIRED_FIELDS) {
      return true;
    }

    const belowThresholdCount = REQUIRED_GENERAL_FIELDS.filter(
      ({ key }) => !isEmptyValue(gi[key].value) && gi[key].confidence < LOW_CONFIDENCE_THRESHOLD
    ).length;
    if (belowThresholdCount > 0) {
      return true;
    }

    const documentTypeUnknown = response.warnings.some(
      (w) => w.field === "document" && w.message.includes(UNKNOWN_DOCUMENT_TYPE_WARNING_SNIPPET)
    );
    if (documentTypeUnknown) {
      return true;
    }

    const hasWorkOrderValue = !isEmptyValue(gi.workOrderValue.value) && (gi.workOrderValue.value ?? 0) > 0;
    if (response.quantity.length === 0 && !hasWorkOrderValue) {
      return true;
    }

    if (response.paymentMilestones.milestones.length === 0) {
      return true;
    }

    return false;
  } catch {
    // A bug in this evaluator must never block the existing rule-engine-
    // only path — default to skipping the AI leg entirely (Stage 3 §17's
    // fallback principle applies here too, defensively).
    return false;
  }
}
