import type { FieldCandidate } from "./confidenceScoring";
import type { DocumentType } from "./documentClassifier";
import { classifyDocument } from "./documentClassifier";
import { getSectionHeadingHints } from "./templateProfiles";
import type { DetectedSection, PageLike } from "./sectionDetector";
import { detectSections, textForSections, textForWholeDocument } from "./sectionDetector";
import { runFieldMappingEngine } from "./fieldMappingEngine";
import type { RawQuantityRow } from "./quantityTableDetector";
import { detectQuantityTable } from "./quantityTableDetector";
import type { RawMilestone } from "./paymentMilestoneDetector";
import { detectPaymentMilestones } from "./paymentMilestoneDetector";

export type { RawQuantityRow } from "./quantityTableDetector";
export type { RawMilestone } from "./paymentMilestoneDetector";

/**
 * EXTRACTOR — the thin entry point that composes the Field Mapping Engine
 * pipeline: Document Classifier → Section Detector → (Field Mapping Engine
 * + Quantity Table Detector + Payment Milestone Detector). No field's
 * aliases or label text live in this file — see fieldMappingConfig.ts for
 * that. This file only sequences the stages and assembles their output
 * into the shape normalizer.ts (Stage 2) already expects, so nothing
 * downstream of here (Normalizer, responseBuilder, the untouched
 * pdfImportMapper.ts, and every UI component) needed to change.
 */

const QUANTITY_SECTION_HINTS = ["quantity schedule", "commercial details", "scope of work"];
const PAYMENT_SECTION_HINTS = ["payment terms", "commercial details"];

export interface ExtractedFields {
  documentType: DocumentType;
  poMonth: FieldCandidate<string>;
  prCategory: FieldCandidate<string>;
  client: FieldCandidate<string>;
  projectTitle: FieldCandidate<string>;
  department: FieldCandidate<string>;
  domesticForeign: FieldCandidate<string>;
  workOrderStatus: FieldCandidate<string>;
  projectStatus: FieldCandidate<string>;
  projectStartDate: FieldCandidate<string>;
  projectEndDate: FieldCandidate<string>;
  estimatedDurationRaw: FieldCandidate<string>;
  workOrderNumber: FieldCandidate<string>;
  workOrderDate: FieldCandidate<string>;
  eicName: FieldCandidate<string>;
  contactNumber: FieldCandidate<string>;
  emailId: FieldCandidate<string>;
  contractType: FieldCandidate<string>;
  pmoCoordinator: FieldCandidate<string>;
  currency: FieldCandidate<string>;
  workOrderValueRaw: FieldCandidate<string>;
  poNumber: FieldCandidate<string>;
  remarks: FieldCandidate<string>;
  quantityRows: RawQuantityRow[];
  milestones: RawMilestone[];
}

function detectQuantityRowsWithFallback(sections: DetectedSection[]): RawQuantityRow[] {
  const scoped = detectQuantityTable(textForSections(sections, QUANTITY_SECTION_HINTS));
  if (scoped.length > 0) return scoped;
  return detectQuantityTable(textForWholeDocument(sections));
}

function detectMilestonesWithFallback(sections: DetectedSection[]): RawMilestone[] {
  const scoped = detectPaymentMilestones(textForSections(sections, PAYMENT_SECTION_HINTS));
  if (scoped.length > 0) return scoped;
  return detectPaymentMilestones(textForWholeDocument(sections));
}

export function extractFields(pages: PageLike[]): ExtractedFields {
  const wholeDocForClassification = pages.map((p) => p.text).join("\n\n");
  const classification = classifyDocument(wholeDocForClassification);
  const docType = classification.docType;

  const sections = detectSections(pages, getSectionHeadingHints(docType));

  const mapped = runFieldMappingEngine(sections, docType);

  return {
    documentType: docType,
    poMonth: mapped.poMonth,
    prCategory: mapped.prCategory,
    client: mapped.client,
    projectTitle: mapped.projectTitle,
    department: mapped.department,
    domesticForeign: mapped.domesticForeign,
    workOrderStatus: mapped.workOrderStatus,
    projectStatus: mapped.projectStatus,
    projectStartDate: mapped.projectStartDate,
    projectEndDate: mapped.projectEndDate,
    estimatedDurationRaw: mapped.estimatedDurationRaw,
    workOrderNumber: mapped.workOrderNumber,
    workOrderDate: mapped.workOrderDate,
    eicName: mapped.eicName,
    contactNumber: mapped.contactNumber,
    emailId: mapped.emailId,
    contractType: mapped.contractType,
    pmoCoordinator: mapped.pmoCoordinator,
    currency: mapped.currency,
    workOrderValueRaw: mapped.workOrderValueRaw,
    poNumber: mapped.poNumber,
    remarks: mapped.remarks,
    quantityRows: detectQuantityRowsWithFallback(sections),
    milestones: detectMilestonesWithFallback(sections),
  };
}
