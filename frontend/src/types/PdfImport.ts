/**
 * Frontend-only shape for the "Import Project from PDF" feature. Version 1
 * has no backend, no OCR, no AI — see pdfImportService.ts for the mock that
 * stands in for a future `POST /pdf-import/extract` response. Every field
 * this document eventually maps into is a real field GeneralInfoCard.tsx /
 * QuantityCard.tsx / PaymentMilestoneCard.tsx already renders — nothing
 * here invents a new Project field.
 */

/** 100 Exact Match / 90 Strong Match / 70 Partial Match / 40 Low Confidence / 0 Not Found — the five-tier scale the (future) Rule Engine scores every extracted field against. */
export type PdfImportConfidence = 100 | 90 | 70 | 40 | 0;

/**
 * "rule-engine" (default when omitted — every existing extraction path
 * predates this field and never sets it) vs. "ai" (the Claude AI-assist
 * supplement, added on top of the existing rule engine per the approved
 * PDF Import + Claude architecture — see pdfImportService.ts's
 * extractPdfFilesSequentially() / pdfImportMerge.ts). Claude only ever runs
 * when the user explicitly checks "Use Claude AI for enhanced extraction"
 * in the PDF Import modal — never automatically. Purely additive: no
 * existing caller that constructs an ExtractedField without `source` needs
 * to change.
 */
export type FieldSource = "rule-engine" | "ai";

export interface ExtractedField<T> {
  value: T;
  confidence: PdfImportConfidence;
  warnings?: string[];
  source?: FieldSource;
}

export interface PdfImportGeneralInformation {
  poMonth: ExtractedField<string>;
  prCategory: ExtractedField<string>;
  projectTitle: ExtractedField<string>;
  client: ExtractedField<string>;
  department: ExtractedField<string>;
  domesticForeign: ExtractedField<string>;
  workOrderStatus: ExtractedField<string>;
  projectStatus: ExtractedField<string>;
  projectStartDate: ExtractedField<string>;
  projectEndDate: ExtractedField<string>;
  estimatedDuration: ExtractedField<number | null>;
  durationUnit: ExtractedField<string>;
  workOrderNumber: ExtractedField<string>;
  workOrderDate: ExtractedField<string>;
  eicName: ExtractedField<string>;
  contactNumber: ExtractedField<string>;
  emailId: ExtractedField<string>;
  contractType: ExtractedField<string>;
  pmoCoordinator: ExtractedField<string>;
  /**
   * Not itself a Project field — the PDF's stated total Work Order Value.
   * Used only by the mapper to build the single "LUMP SUM PROJECT" fallback
   * Quantity row when the PDF has no itemized quantity breakdown at all.
   */
  workOrderValue: ExtractedField<number | null>;
  currency: ExtractedField<string>;
}

export interface PdfImportQuantityRow {
  description: ExtractedField<string>;
  qty: ExtractedField<number>;
  uom: ExtractedField<string>;
  unitRate: ExtractedField<number>;
}

export interface PdfImportMilestone {
  milestoneName: ExtractedField<string>;
  paymentPercentage: ExtractedField<number>;
  dueDate: ExtractedField<string>;
}

export interface PdfImportPaymentMilestones {
  paymentType: ExtractedField<"Single" | "Multiple">;
  milestones: PdfImportMilestone[];
}

export type PdfImportWarningSeverity = "info" | "warning" | "error";

export interface PdfImportWarning {
  field: string;
  message: string;
  severity: PdfImportWarningSeverity;
}

/**
 * A value the extraction found but that the Rule Engine deliberately never
 * maps into the form — most notably PO Number, which per explicit business
 * rule is always entered manually, never auto-filled, even when the PDF
 * clearly states one.
 */
export interface PdfImportUnmappedField {
  label: string;
  rawValue: string;
  reason: string;
}

export interface PdfImportResponse {
  fileName: string;
  generalInformation: PdfImportGeneralInformation;
  quantity: PdfImportQuantityRow[];
  paymentMilestones: PdfImportPaymentMilestones;
  warnings: PdfImportWarning[];
  unmappedFields: PdfImportUnmappedField[];
  /** Simple average across every extracted field — a quick top-level signal only; the per-field badges in the preview are the actual source of truth. */
  overallConfidence: number;
}

/**
 * "results" is new — shown after a multi-file batch finishes, listing
 * every selected PDF's outcome (success/invalid/failed) before the user
 * picks one to review in "preview". Skipped automatically when exactly one
 * file was selected and it succeeded, so the single-file case still goes
 * straight from processing to preview, unchanged from before multi-file
 * support existed.
 */
export type PdfUploadStage = "idle" | "uploading" | "processing" | "results" | "preview" | "error";
