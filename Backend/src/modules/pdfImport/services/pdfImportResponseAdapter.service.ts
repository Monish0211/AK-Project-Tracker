import {
  CONTRACT_TYPE_OPTIONS,
  CURRENCY_OPTIONS,
  DOMESTIC_FOREIGN_OPTIONS,
  DURATION_UNIT_OPTIONS,
  PAYMENT_TYPE_OPTIONS,
  PR_CATEGORIES,
  PROJECT_STATUS_OPTIONS,
  WORK_ORDER_STATUS_OPTIONS,
  enforceEnumOrNull,
  isValidContractType,
  isValidCurrency,
  isValidDomesticForeign,
  isValidDurationUnit,
  isValidPaymentType,
  isValidPrCategory,
  isValidProjectStatus,
  isValidWorkOrderStatus,
} from "../validators/enumOptions.js";
import type { ClaudeExtractionResult } from "../validators/claudeResponse.validators.js";
import type {
  AiExtractedField,
  AiMilestone,
  AiQuantityRow,
  PdfImportAiCandidate,
} from "../pdfImport.types.js";

/**
 * The single conversion boundary from Claude's world into a
 * PdfImportResponse-shaped candidate (Stage 3 §9 / Stage 4 Step 7).
 * Confidence is capped at 70 for every field Claude actually supplied
 * (Stage 3 §10 — never 100, never 90, regardless of anything Claude itself
 * claimed) and every AI-sourced field carries source:"ai" plus an explicit
 * verify-me warning. Enum-constrained fields are checked against
 * enumOptions.ts; a non-matching value is treated exactly like "not
 * found" — never coerced to a closest guess (Stage 3 §11).
 */

const AI_VERIFY_WARNING = "AI-suggested value — please verify.";

/**
 * Multi-document cross-verification — layered on top of every wrap*Field()
 * call below, never replacing it. A field the normal wrap logic already
 * rejected/blanked (confidence 0 — not found, or an enum value Claude
 * suggested that isn't a recognized option) is left untouched: there is
 * nothing to escalate or flag on a value that was never accepted in the
 * first place.
 *
 * - A genuine conflict (claude.conflicts has an entry for this field) always
 *   wins over the agreement check below: confidence drops to the existing
 *   "Low Confidence" tier (40) and the conflicting values + their source
 *   documents are folded into the field's own `warnings` array — the
 *   EXISTING mechanism, never a new UI structure — exactly matching the
 *   required "⚠ Conflicting values found across uploaded documents" text.
 * - Otherwise, if 2+ documents contributed this exact value
 *   (claude.fieldSources[key].length >= 2), confidence is bumped to the
 *   existing "Strong Match" tier (90) — cross-document agreement is
 *   inherently stronger evidence than one document's own reading.
 * - A single-source field (or a response that omitted fieldSources
 *   entirely — e.g. an older/simpler Claude reply) keeps today's existing
 *   flat 70, unchanged.
 */
function withDocumentSetSignal<T>(claude: ClaudeExtractionResult, key: string, field: AiExtractedField<T>): AiExtractedField<T> {
  if (field.confidence === 0) return field;

  const conflict = claude.conflicts?.find((c) => c.field === key);
  if (conflict) {
    const summary = conflict.values.map((v) => `${v.documentName}: ${v.value ?? "(not found)"}`).join(" | ");
    return { ...field, confidence: 40, warnings: [`Conflicting values found across uploaded documents. ${summary}`] };
  }

  const sourceCount = claude.fieldSources?.[key]?.length ?? 1;
  if (sourceCount >= 2) {
    return { ...field, confidence: 90 };
  }

  return field;
}

function wrapStringField(value: string | null | undefined): AiExtractedField<string> {
  const trimmed = value?.trim();
  if (!trimmed) {
    return { value: "", confidence: 0, source: "ai" };
  }
  return { value: trimmed, confidence: 70, warnings: [AI_VERIFY_WARNING], source: "ai" };
}

function wrapNumberField(value: number | null | undefined): AiExtractedField<number | null> {
  if (value === null || value === undefined) {
    return { value: null, confidence: 0, source: "ai" };
  }
  return { value, confidence: 70, warnings: [AI_VERIFY_WARNING], source: "ai" };
}

function wrapRequiredNumberField(value: number | null | undefined): AiExtractedField<number> {
  if (value === null || value === undefined) {
    return { value: 0, confidence: 0, source: "ai" };
  }
  return { value, confidence: 70, warnings: [AI_VERIFY_WARNING], source: "ai" };
}

/**
 * Shared handling for the 7 true-enum fields (everything except
 * Department, which is deliberately NOT a reject-on-mismatch field — see
 * enumOptions.ts's isPresetDepartment() comment). A value outside the
 * valid option list is treated identically to "not found."
 */
function wrapEnumField(value: string | null | undefined, isValid: (v: string) => boolean): AiExtractedField<string> {
  const trimmed = value?.trim() || null;
  const enforced = enforceEnumOrNull(trimmed, isValid);

  if (!enforced) {
    const rejected = !!trimmed && !isValid(trimmed);
    return {
      value: "",
      confidence: 0,
      source: "ai",
      ...(rejected
        ? { warnings: [`AI suggested "${trimmed}", which is not a recognized option for this field — not accepted.`] }
        : {}),
    };
  }

  return { value: enforced, confidence: 70, warnings: [AI_VERIFY_WARNING], source: "ai" };
}

/**
 * Department is a hybrid preset+free-text field on the real form (4
 * presets + an "Others" free-text escape) — a non-preset AI suggestion is
 * still legitimate candidate data, never blanked, just treated the same as
 * any other free-text field.
 */
function wrapDepartmentField(value: string | null | undefined): AiExtractedField<string> {
  return wrapStringField(value);
}

function averageConfidence(fields: Array<{ confidence: number }>): number {
  if (fields.length === 0) return 0;
  return Math.round(fields.reduce((sum, f) => sum + f.confidence, 0) / fields.length);
}

export function buildPdfImportAiCandidate(claude: ClaudeExtractionResult): PdfImportAiCandidate {
  const g = claude.generalInformation ?? {};

  const generalInformation = {
    poMonth: withDocumentSetSignal(claude, "poMonth", wrapStringField(g.poMonth)),
    prCategory: withDocumentSetSignal(claude, "prCategory", wrapEnumField(g.prCategory, isValidPrCategory)),
    projectTitle: withDocumentSetSignal(claude, "projectTitle", wrapStringField(g.projectTitle)),
    client: withDocumentSetSignal(claude, "client", wrapStringField(g.client)),
    department: withDocumentSetSignal(claude, "department", wrapDepartmentField(g.department)),
    domesticForeign: withDocumentSetSignal(claude, "domesticForeign", wrapEnumField(g.domesticForeign, isValidDomesticForeign)),
    workOrderStatus: withDocumentSetSignal(claude, "workOrderStatus", wrapEnumField(g.workOrderStatus, isValidWorkOrderStatus)),
    projectStatus: withDocumentSetSignal(claude, "projectStatus", wrapEnumField(g.projectStatus, isValidProjectStatus)),
    projectStartDate: withDocumentSetSignal(claude, "projectStartDate", wrapStringField(g.projectStartDate)),
    projectEndDate: withDocumentSetSignal(claude, "projectEndDate", wrapStringField(g.projectEndDate)),
    estimatedDuration: withDocumentSetSignal(claude, "estimatedDuration", wrapNumberField(g.estimatedDuration)),
    durationUnit: withDocumentSetSignal(claude, "durationUnit", wrapEnumField(g.durationUnit, isValidDurationUnit)),
    workOrderNumber: withDocumentSetSignal(claude, "workOrderNumber", wrapStringField(g.workOrderNumber)),
    workOrderDate: withDocumentSetSignal(claude, "workOrderDate", wrapStringField(g.workOrderDate)),
    eicName: withDocumentSetSignal(claude, "eicName", wrapStringField(g.eicName)),
    contactNumber: withDocumentSetSignal(claude, "contactNumber", wrapStringField(g.contactNumber)),
    emailId: withDocumentSetSignal(claude, "emailId", wrapStringField(g.emailId)),
    contractType: withDocumentSetSignal(claude, "contractType", wrapEnumField(g.contractType, isValidContractType)),
    pmoCoordinator: withDocumentSetSignal(claude, "pmoCoordinator", wrapStringField(g.pmoCoordinator)),
    workOrderValue: withDocumentSetSignal(claude, "workOrderValue", wrapNumberField(g.workOrderValue)),
    currency: withDocumentSetSignal(claude, "currency", wrapEnumField(g.currency, isValidCurrency)),
  };

  const quantity: AiQuantityRow[] = (claude.quantity ?? []).map((row) => ({
    description: wrapStringField(row?.description),
    qty: wrapRequiredNumberField(row?.qty),
    uom: wrapStringField(row?.uom),
    unitRate: wrapRequiredNumberField(row?.unitRate),
  }));

  const milestoneList: AiMilestone[] = (claude.paymentMilestones ?? []).map((m) => ({
    milestoneName: wrapStringField(m?.milestoneName),
    paymentPercentage: wrapRequiredNumberField(m?.paymentPercentage),
    dueDate: wrapStringField(m?.dueDate),
  }));

  const paymentTypeValue = milestoneList.length > 1 ? "Multiple" : "Single";
  const paymentMilestones = {
    paymentType: {
      value: (isValidPaymentType(paymentTypeValue) ? paymentTypeValue : "Single") as "Single" | "Multiple",
      confidence: (milestoneList.length > 0 ? 70 : 0) as 100 | 90 | 70 | 40 | 0,
      source: "ai" as const,
    },
    milestones: milestoneList,
  };

  const overallConfidence = averageConfidence([
    ...Object.values(generalInformation),
    ...quantity.flatMap((row) => Object.values(row)),
  ]);

  return {
    generalInformation,
    quantity,
    paymentMilestones,
    warnings: [],
    unmappedFields: [],
    overallConfidence,
  };
}

// Re-exported so callers (controller/tests) don't need a second import from
// enumOptions.js just to reference the option lists this adapter enforces.
export {
  PR_CATEGORIES,
  DOMESTIC_FOREIGN_OPTIONS,
  WORK_ORDER_STATUS_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  CONTRACT_TYPE_OPTIONS,
  CURRENCY_OPTIONS,
  DURATION_UNIT_OPTIONS,
  PAYMENT_TYPE_OPTIONS,
};
