/**
 * Shapes used by the PDF Import AI-assist (Claude) module. Mirrors
 * frontend/src/types/PdfImport.ts's PdfImportResponse field-by-field — this
 * backend never imports from frontend/ (no cross-package type sharing
 * exists anywhere in this repo, confirmed against timesheets/mailIngestion)
 * — so the JSON this module returns is structurally compatible with that
 * contract without a shared import.
 *
 * Claude never owns Project creation, persistence, PR/PO Number, or any
 * calculation — this module only ever produces a candidate the frontend
 * merges into the existing rule-engine result (see pdfImportMerge.ts).
 */

export type PdfImportConfidence = 100 | 90 | 70 | 40 | 0;

export type FieldSource = "rule-engine" | "ai";

export interface AiExtractedField<T> {
  value: T;
  confidence: PdfImportConfidence;
  warnings?: string[];
  source: FieldSource;
}

export interface AiGeneralInformation {
  poMonth: AiExtractedField<string>;
  prCategory: AiExtractedField<string>;
  projectTitle: AiExtractedField<string>;
  client: AiExtractedField<string>;
  department: AiExtractedField<string>;
  domesticForeign: AiExtractedField<string>;
  workOrderStatus: AiExtractedField<string>;
  projectStatus: AiExtractedField<string>;
  projectStartDate: AiExtractedField<string>;
  projectEndDate: AiExtractedField<string>;
  estimatedDuration: AiExtractedField<number | null>;
  durationUnit: AiExtractedField<string>;
  workOrderNumber: AiExtractedField<string>;
  workOrderDate: AiExtractedField<string>;
  eicName: AiExtractedField<string>;
  contactNumber: AiExtractedField<string>;
  emailId: AiExtractedField<string>;
  contractType: AiExtractedField<string>;
  pmoCoordinator: AiExtractedField<string>;
  /** PDF's stated total Work Order Value — same non-Project-field role as the frontend contract's own field. */
  workOrderValue: AiExtractedField<number | null>;
  currency: AiExtractedField<string>;
}

export interface AiQuantityRow {
  description: AiExtractedField<string>;
  qty: AiExtractedField<number>;
  uom: AiExtractedField<string>;
  unitRate: AiExtractedField<number>;
}

export interface AiMilestone {
  milestoneName: AiExtractedField<string>;
  paymentPercentage: AiExtractedField<number>;
  dueDate: AiExtractedField<string>;
}

export interface AiPaymentMilestones {
  paymentType: AiExtractedField<"Single" | "Multiple">;
  milestones: AiMilestone[];
}

export type AiWarningSeverity = "info" | "warning" | "error";

export interface AiWarning {
  field: string;
  message: string;
  severity: AiWarningSeverity;
}

export interface AiUnmappedField {
  label: string;
  rawValue: string;
  reason: string;
}

/**
 * The JSON shape POST /pdf-import/ai-extract returns on success — the
 * validated, enum-checked, confidence-capped, provenance-tagged candidate.
 * Never a Project, never a database row.
 */
export interface PdfImportAiCandidate {
  generalInformation: AiGeneralInformation;
  quantity: AiQuantityRow[];
  paymentMilestones: AiPaymentMilestones;
  warnings: AiWarning[];
  unmappedFields: AiUnmappedField[];
  overallConfidence: number;
}
