import type { PdfImportResponse, PdfImportWarning } from "../types/PdfImport";

/**
 * Fields validateGeneralTab() (projectValidation.ts) already requires for
 * the General tab — mirrored here, not re-invented, so a field this
 * validator flags as "missing" is guaranteed to be one the existing form
 * would also block Save on if left blank.
 */
export const REQUIRED_GENERAL_FIELDS: Array<{
  key: keyof PdfImportResponse["generalInformation"];
  label: string;
}> = [
  { key: "poMonth", label: "PO Month" },
  { key: "prCategory", label: "PR Category" },
  { key: "projectTitle", label: "Project Title" },
  { key: "client", label: "Client Name" },
  { key: "department", label: "Department" },
  { key: "domesticForeign", label: "Domestic / Foreign" },
  { key: "workOrderStatus", label: "Work Order Status" },
  { key: "projectStatus", label: "Project Status" },
  { key: "projectStartDate", label: "Project Start Date" },
  { key: "contractType", label: "Contract Type" },
  { key: "pmoCoordinator", label: "PMO Coordinator" },
  { key: "workOrderNumber", label: "Work Order Number" },
  { key: "workOrderDate", label: "Work Order Date" },
  { key: "eicName", label: "EIC Name" },
];

export const LOW_CONFIDENCE_THRESHOLD = 70;

function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

/**
 * Computes additional warnings from the extracted data itself (missing
 * required fields, low-confidence matches, a milestone schedule that
 * doesn't sum to 100%, no quantity information at all) — separate from,
 * and additive to, whatever warnings the extraction response already
 * carries. Never mutates the response; the caller merges both lists for
 * display in WarningsPanel.
 */
export function validatePdfImportResponse(response: PdfImportResponse): PdfImportWarning[] {
  const warnings: PdfImportWarning[] = [];
  const gi = response.generalInformation;

  for (const { key, label } of REQUIRED_GENERAL_FIELDS) {
    const extracted = gi[key];
    if (isEmptyValue(extracted.value)) {
      warnings.push({
        field: key,
        message: `${label} is required and was not found in the document — please enter it manually.`,
        severity: "error",
      });
    } else if (extracted.confidence < LOW_CONFIDENCE_THRESHOLD) {
      warnings.push({
        field: key,
        message: `${label} was extracted with low confidence (${extracted.confidence}%) — please verify.`,
        severity: "warning",
      });
    }
  }

  const hasQuantityRows = response.quantity.length > 0;
  const hasWorkOrderValue = !isEmptyValue(gi.workOrderValue.value) && (gi.workOrderValue.value ?? 0) > 0;
  if (!hasQuantityRows && !hasWorkOrderValue) {
    warnings.push({
      field: "quantity",
      message: "No itemized Quantity information or Work Order Value could be extracted — Quantity will need to be added manually.",
      severity: "error",
    });
  }

  const milestones = response.paymentMilestones.milestones;
  if (response.paymentMilestones.paymentType.value === "Multiple" && milestones.length > 0) {
    const totalPercent = milestones.reduce((sum, m) => sum + (m.paymentPercentage.value || 0), 0);
    if (Math.abs(totalPercent - 100) > 0.01) {
      warnings.push({
        field: "paymentMilestones",
        message: `Payment Milestone percentages total ${totalPercent}%, not 100% — please review before saving.`,
        severity: "warning",
      });
    }
  }

  return warnings;
}
