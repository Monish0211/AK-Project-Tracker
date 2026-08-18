import type {
  ExtractedField,
  PdfImportGeneralInformation,
  PdfImportPaymentMilestones,
  PdfImportResponse,
  PdfImportWarning,
} from "../types/PdfImport";
import { REQUIRED_GENERAL_FIELDS } from "./pdfImportValidator";
import { isEmptyValue, valuesEqual } from "./pdfImportMerge";

/**
 * Multi-document cross-verification — the OCR/rule-engine side (works
 * WITHOUT Claude). Every uploaded PDF still goes through
 * extractPdfImportResponse() exactly as before, one call per file,
 * completely unchanged; this function only combines the N results that
 * already exist into ONE consolidated PdfImportResponse. It is the
 * document-set analogue of pdfImportMerge.ts's mergeWithAiCandidate() —
 * same governing rule, generalized from 2 sources (rule-engine, AI) to N
 * sources (document 1, document 2, ..., document N):
 *
 * - A field only one document found → adopt it as-is.
 * - A field multiple documents found and AGREE on → adopt it, with
 *   confidence bumped to the existing "Strong Match" tier (90) if it
 *   wasn't already higher — cross-document agreement is itself evidence.
 * - A field multiple documents found and DISAGREE on → never silently
 *   choose. Confidence drops to the existing "Low Confidence" tier (40)
 *   and every distinct value + its source file name is folded into that
 *   field's own `warnings` (the existing mechanism, no new UI structure).
 * - A field no document found → stays empty/missing. Never fabricated.
 */

export interface DocumentSetMember {
  fileName: string;
  response: PdfImportResponse;
}

const FIELD_LABELS: Partial<Record<keyof PdfImportGeneralInformation, string>> = Object.fromEntries(
  REQUIRED_GENERAL_FIELDS.map(({ key, label }) => [key, label])
);

interface FieldCandidate<T> {
  fileName: string;
  field: ExtractedField<T>;
}

function mergeDocumentSetField<T>(
  fieldKey: string,
  candidates: FieldCandidate<T>[],
  conflictWarnings: PdfImportWarning[]
): ExtractedField<T> {
  const withValues = candidates.filter((c) => !isEmptyValue(c.field.value));

  if (withValues.length === 0) {
    return candidates[0].field;
  }
  if (withValues.length === 1) {
    return withValues[0].field;
  }

  const [first, ...rest] = withValues;
  const allAgree = rest.every((c) => valuesEqual(c.field.value, first.field.value));

  if (allAgree) {
    const winner = withValues.reduce((best, c) => (c.field.confidence > best.field.confidence ? c : best));
    const bumpedConfidence = Math.max(90, winner.field.confidence) as ExtractedField<T>["confidence"];
    return { ...winner.field, confidence: bumpedConfidence };
  }

  // Genuine conflict. Deterministic tie-break for the displayed value
  // only (highest original confidence, then earliest upload order) —
  // never a "smart" resolution; the warning is what actually surfaces
  // this to the user for manual verification.
  const label = FIELD_LABELS[fieldKey as keyof PdfImportGeneralInformation] ?? fieldKey;
  const chosen = withValues.reduce((best, c) => (c.field.confidence > best.field.confidence ? c : best));
  const summary = withValues.map((c) => `${c.fileName}: ${String(c.field.value)}`).join(" | ");
  conflictWarnings.push({
    field: fieldKey,
    message: `${label}: Conflicting values found across uploaded documents. ${summary}`,
    severity: "warning",
  });

  return { ...chosen.field, confidence: 40 };
}

export function mergeDocumentSet(members: DocumentSetMember[]): PdfImportResponse {
  if (members.length === 0) {
    throw new Error("mergeDocumentSet() requires at least one document.");
  }
  if (members.length === 1) {
    // Nothing to cross-check against — identical to today's single-file
    // result, untouched.
    return members[0].response;
  }

  const conflictWarnings: PdfImportWarning[] = [];

  const candidatesFor = <K extends keyof PdfImportGeneralInformation>(key: K): FieldCandidate<PdfImportGeneralInformation[K]["value"]>[] =>
    members.map((m) => ({ fileName: m.fileName, field: m.response.generalInformation[key] }));

  const generalInformation: PdfImportGeneralInformation = {
    poMonth: mergeDocumentSetField("poMonth", candidatesFor("poMonth"), conflictWarnings),
    prCategory: mergeDocumentSetField("prCategory", candidatesFor("prCategory"), conflictWarnings),
    projectTitle: mergeDocumentSetField("projectTitle", candidatesFor("projectTitle"), conflictWarnings),
    client: mergeDocumentSetField("client", candidatesFor("client"), conflictWarnings),
    department: mergeDocumentSetField("department", candidatesFor("department"), conflictWarnings),
    domesticForeign: mergeDocumentSetField("domesticForeign", candidatesFor("domesticForeign"), conflictWarnings),
    workOrderStatus: mergeDocumentSetField("workOrderStatus", candidatesFor("workOrderStatus"), conflictWarnings),
    projectStatus: mergeDocumentSetField("projectStatus", candidatesFor("projectStatus"), conflictWarnings),
    projectStartDate: mergeDocumentSetField("projectStartDate", candidatesFor("projectStartDate"), conflictWarnings),
    projectEndDate: mergeDocumentSetField("projectEndDate", candidatesFor("projectEndDate"), conflictWarnings),
    estimatedDuration: mergeDocumentSetField("estimatedDuration", candidatesFor("estimatedDuration"), conflictWarnings),
    durationUnit: mergeDocumentSetField("durationUnit", candidatesFor("durationUnit"), conflictWarnings),
    workOrderNumber: mergeDocumentSetField("workOrderNumber", candidatesFor("workOrderNumber"), conflictWarnings),
    workOrderDate: mergeDocumentSetField("workOrderDate", candidatesFor("workOrderDate"), conflictWarnings),
    eicName: mergeDocumentSetField("eicName", candidatesFor("eicName"), conflictWarnings),
    contactNumber: mergeDocumentSetField("contactNumber", candidatesFor("contactNumber"), conflictWarnings),
    emailId: mergeDocumentSetField("emailId", candidatesFor("emailId"), conflictWarnings),
    contractType: mergeDocumentSetField("contractType", candidatesFor("contractType"), conflictWarnings),
    pmoCoordinator: mergeDocumentSetField("pmoCoordinator", candidatesFor("pmoCoordinator"), conflictWarnings),
    workOrderValue: mergeDocumentSetField("workOrderValue", candidatesFor("workOrderValue"), conflictWarnings),
    currency: mergeDocumentSetField("currency", candidatesFor("currency"), conflictWarnings),
  };

  // Quantity/Milestones: adopt one whole array (the first document that
  // has one) — never merge individual rows across documents. Mirrors
  // mergeWithAiCandidate()'s identical, deliberately conservative
  // treatment of these two arrays (a row-level merge across genuinely
  // different documents is too ambiguous to do safely).
  const quantitySource = members.find((m) => m.response.quantity.length > 0);
  const quantity = quantitySource ? quantitySource.response.quantity : [];

  const milestonesSource = members.find((m) => m.response.paymentMilestones.milestones.length > 0);
  const paymentMilestones: PdfImportPaymentMilestones = milestonesSource
    ? milestonesSource.response.paymentMilestones
    : members[0].response.paymentMilestones;

  const warnings: PdfImportWarning[] = [
    ...members.flatMap((m) => m.response.warnings.map((w) => ({ ...w, message: `[${m.fileName}] ${w.message}` }))),
    ...conflictWarnings,
  ];

  const unmappedFields = members.flatMap((m) => m.response.unmappedFields);

  const confidenceValues = Object.values(generalInformation).map((f) => f.confidence);
  const overallConfidence =
    confidenceValues.length === 0
      ? 0
      : Math.round(confidenceValues.reduce((sum, c) => sum + c, 0) / confidenceValues.length);

  return {
    fileName: members.map((m) => m.fileName).join(", "),
    generalInformation,
    quantity,
    paymentMilestones,
    warnings,
    unmappedFields,
    overallConfidence,
  };
}
