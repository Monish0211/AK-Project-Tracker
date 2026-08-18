import type {
  ExtractedField,
  PdfImportGeneralInformation,
  PdfImportResponse,
  PdfImportWarning,
} from "../types/PdfImport";
import { REQUIRED_GENERAL_FIELDS } from "./pdfImportValidator";

/**
 * Merges the rule engine's own PdfImportResponse with the backend's Claude
 * candidate (Stage 3 §11 / Stage 4 Step 13). Governing rule, non-
 * negotiable: a rule-engine value is NEVER silently overwritten by an AI
 * value. Where both sources have a value and disagree, the rule-engine
 * value stays displayed and a conflict warning is attached carrying the
 * AI's alternative — the user decides, this function never decides for
 * them.
 */

/** Shape of the backend's /pdf-import/ai-extract success response — the
 * PdfImportAiCandidate contract, structurally identical to PdfImportResponse
 * minus fileName (which the frontend already knows locally). */
export type PdfImportAiCandidate = Omit<PdfImportResponse, "fileName">;

const FIELD_LABELS: Partial<Record<keyof PdfImportGeneralInformation, string>> = Object.fromEntries(
  REQUIRED_GENERAL_FIELDS.map(({ key, label }) => [key, label])
);

/** Exported for pdfImportDocumentSetMerge.ts's own N-way merge — same equality rules apply whether the two sides being compared are (rule-engine, AI) or (document A, document B). */
export function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

export function valuesEqual(a: unknown, b: unknown): boolean {
  if (typeof a === "string" && typeof b === "string") {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }
  return a === b;
}

function mergeField<T>(
  fieldKey: string,
  ruleField: ExtractedField<T>,
  aiField: ExtractedField<T> | undefined,
  conflictWarnings: PdfImportWarning[]
): ExtractedField<T> {
  const tagged: ExtractedField<T> = { ...ruleField, source: ruleField.source ?? "rule-engine" };

  const ruleHasValue = !isEmptyValue(ruleField.value);
  const aiHasValue = aiField && !isEmptyValue(aiField.value);

  if (!aiHasValue) {
    return tagged;
  }

  if (!ruleHasValue) {
    // Rule engine found nothing here, AI did — adopt the AI candidate as-is
    // (already confidence-capped/enum-checked/provenance-tagged by the
    // backend adapter).
    return { ...aiField! };
  }

  if (valuesEqual(ruleField.value, aiField!.value)) {
    return tagged;
  }

  const label = FIELD_LABELS[fieldKey as keyof PdfImportGeneralInformation] ?? fieldKey;
  conflictWarnings.push({
    field: fieldKey,
    message: `${label}: the extracted value is "${String(ruleField.value)}", but AI suggests "${String(
      aiField!.value
    )}" — please verify which is correct.`,
    severity: "warning",
  });

  return tagged;
}

export function mergeWithAiCandidate(ruleResult: PdfImportResponse, aiCandidate: PdfImportAiCandidate): PdfImportResponse {
  const conflictWarnings: PdfImportWarning[] = [];
  const rg = ruleResult.generalInformation;
  const ag = aiCandidate.generalInformation;

  // Explicit field-by-field, not a generic Object.keys() loop — mirrors the
  // backend adapter's own style (pdfImportResponseAdapter.service.ts) and
  // keeps every field's own value type (string vs. number|null) intact,
  // which a single generic loop over this deliberately heterogeneous
  // interface cannot preserve.
  const generalInformation: PdfImportGeneralInformation = {
    poMonth: mergeField("poMonth", rg.poMonth, ag?.poMonth, conflictWarnings),
    prCategory: mergeField("prCategory", rg.prCategory, ag?.prCategory, conflictWarnings),
    projectTitle: mergeField("projectTitle", rg.projectTitle, ag?.projectTitle, conflictWarnings),
    client: mergeField("client", rg.client, ag?.client, conflictWarnings),
    department: mergeField("department", rg.department, ag?.department, conflictWarnings),
    domesticForeign: mergeField("domesticForeign", rg.domesticForeign, ag?.domesticForeign, conflictWarnings),
    workOrderStatus: mergeField("workOrderStatus", rg.workOrderStatus, ag?.workOrderStatus, conflictWarnings),
    projectStatus: mergeField("projectStatus", rg.projectStatus, ag?.projectStatus, conflictWarnings),
    projectStartDate: mergeField("projectStartDate", rg.projectStartDate, ag?.projectStartDate, conflictWarnings),
    projectEndDate: mergeField("projectEndDate", rg.projectEndDate, ag?.projectEndDate, conflictWarnings),
    estimatedDuration: mergeField("estimatedDuration", rg.estimatedDuration, ag?.estimatedDuration, conflictWarnings),
    durationUnit: mergeField("durationUnit", rg.durationUnit, ag?.durationUnit, conflictWarnings),
    workOrderNumber: mergeField("workOrderNumber", rg.workOrderNumber, ag?.workOrderNumber, conflictWarnings),
    workOrderDate: mergeField("workOrderDate", rg.workOrderDate, ag?.workOrderDate, conflictWarnings),
    eicName: mergeField("eicName", rg.eicName, ag?.eicName, conflictWarnings),
    contactNumber: mergeField("contactNumber", rg.contactNumber, ag?.contactNumber, conflictWarnings),
    emailId: mergeField("emailId", rg.emailId, ag?.emailId, conflictWarnings),
    contractType: mergeField("contractType", rg.contractType, ag?.contractType, conflictWarnings),
    pmoCoordinator: mergeField("pmoCoordinator", rg.pmoCoordinator, ag?.pmoCoordinator, conflictWarnings),
    workOrderValue: mergeField("workOrderValue", rg.workOrderValue, ag?.workOrderValue, conflictWarnings),
    currency: mergeField("currency", rg.currency, ag?.currency, conflictWarnings),
  };

  const hasWorkOrderValue = !isEmptyValue(ruleResult.generalInformation.workOrderValue.value);
  const quantity =
    ruleResult.quantity.length === 0 && !hasWorkOrderValue && aiCandidate.quantity.length > 0
      ? aiCandidate.quantity
      : ruleResult.quantity;

  const milestones =
    ruleResult.paymentMilestones.milestones.length === 0 && aiCandidate.paymentMilestones.milestones.length > 0
      ? aiCandidate.paymentMilestones
      : ruleResult.paymentMilestones;

  return {
    ...ruleResult,
    generalInformation,
    quantity,
    paymentMilestones: milestones,
    warnings: [...ruleResult.warnings, ...conflictWarnings],
  };
}
