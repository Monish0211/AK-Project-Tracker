import type { Project } from "../types/Project";
import type { PdfImportResponse } from "../types/PdfImport";
import { normalizeProject } from "../services/projectService";
import { createEmptyQuantityItem, recalcQuantityItem } from "./quantityCalculations";

/**
 * The ONLY place a PdfImportResponse becomes a Project. Nothing else in the
 * PDF Import feature is allowed to write Project fields directly — see
 * pdfImportService.ts / the PdfImport components, none of which import
 * Project's field names themselves.
 *
 * Deliberately maps into General Information, Quantity, and Payment
 * Milestones ONLY — PO Number, Invoice, Expenses, Documents, Notes,
 * Reports, and Dashboard are never touched, matching the explicit business
 * rule that PO Number is always entered manually (see
 * PdfImportResponse.unmappedFields) and that this phase is scoped to those
 * three sections only.
 */

/** Empty string / null / undefined all mean "not extracted" — keep whatever the base project already had rather than blanking a field the user may have already typed into. */
function valueOrKeep<T>(extracted: { value: T }, current: T): T {
  const v = extracted.value;
  if (v === null || v === undefined) return current;
  if (typeof v === "string" && v.trim() === "") return current;
  return v;
}

const VALID_DURATION_UNITS: Project["durationUnit"][] = ["Days", "Weeks", "Months"];

export function mapPdfImportResponseToProject(response: PdfImportResponse, baseProject: Project): Project {
  const gi = response.generalInformation;
  const currency = valueOrKeep(gi.currency, baseProject.currency || "INR");
  const extractedDurationUnit = gi.durationUnit.value;
  const durationUnit = (VALID_DURATION_UNITS as string[]).includes(extractedDurationUnit)
    ? (extractedDurationUnit as Project["durationUnit"])
    : baseProject.durationUnit;

  const merged: Project = {
    ...baseProject,
    // PO Number / prNo is intentionally NEVER set here — always manual
    // entry, per explicit business rule (see PdfImportResponse.unmappedFields).
    poMonth: valueOrKeep(gi.poMonth, baseProject.poMonth),
    prCategory: valueOrKeep(gi.prCategory, baseProject.prCategory),
    projectTitle: valueOrKeep(gi.projectTitle, baseProject.projectTitle),
    client: valueOrKeep(gi.client, baseProject.client),
    department: valueOrKeep(gi.department, baseProject.department),
    domesticForeign: valueOrKeep(gi.domesticForeign, baseProject.domesticForeign),
    workOrderStatus: valueOrKeep(gi.workOrderStatus, baseProject.workOrderStatus),
    projectStatus: valueOrKeep(gi.projectStatus, baseProject.projectStatus),
    projectStartDate: valueOrKeep(gi.projectStartDate, baseProject.projectStartDate),
    projectEndDate: valueOrKeep(gi.projectEndDate, baseProject.projectEndDate),
    estimatedDuration: gi.estimatedDuration.value ?? baseProject.estimatedDuration,
    durationUnit,
    workOrderNumber: valueOrKeep(gi.workOrderNumber, baseProject.workOrderNumber),
    workOrderDate: valueOrKeep(gi.workOrderDate, baseProject.workOrderDate),
    eicName: valueOrKeep(gi.eicName, baseProject.eicName),
    contactNumber: valueOrKeep(gi.contactNumber, baseProject.contactNumber),
    emailId: valueOrKeep(gi.emailId, baseProject.emailId),
    contractType: valueOrKeep(gi.contractType, baseProject.contractType),
    pmoCoordinator: valueOrKeep(gi.pmoCoordinator, baseProject.pmoCoordinator),
    currency,
  };

  // Quantity — reuses the existing calculation engine (recalcQuantityItem)
  // so unitRateINR/woValue/pendingQty/pendingAmount are computed exactly the
  // same way a manually-typed row would be, never a separate formula.
  let quantityItems = response.quantity.map((row) =>
    recalcQuantityItem(
      {
        ...createEmptyQuantityItem(currency, baseProject.currentExchangeRate),
        description: row.description.value,
        woQty: row.qty.value,
        uom: row.uom.value,
        unitRate: row.unitRate.value,
      },
      currency,
      baseProject.currentExchangeRate
    )
  );

  // No itemized breakdown, but a stated Work Order Value — one LUMP SUM
  // row, exactly per the specified business rule. UOM is set to the
  // existing "LUMP SUM" option (already a real entry in QuantityCard's
  // UOM_OPTIONS, and already special-cased by recalcQuantityItem's own
  // isLumpSum branch) rather than the literal string "LS" — "LS" is not
  // one of the form's selectable UOM options and would render as a blank,
  // seemingly-broken dropdown the moment a user opened this row; "LUMP SUM"
  // is the form's own real representation of the same business concept and
  // produces an identical woValue for a qty-of-1 row either way.
  if (quantityItems.length === 0 && gi.workOrderValue.value) {
    quantityItems = [
      recalcQuantityItem(
        {
          ...createEmptyQuantityItem(currency, baseProject.currentExchangeRate),
          description: "LUMP SUM PROJECT",
          woQty: 1,
          uom: "LUMP SUM",
          unitRate: gi.workOrderValue.value,
        },
        currency,
        baseProject.currentExchangeRate
      ),
    ];
  }

  if (quantityItems.length > 0) {
    merged.quantityItems = quantityItems;
  }

  // Payment Milestones — amount is left at 0 here; normalizeProject() below
  // recomputes every milestone's amount from paymentPercentage × the
  // project's own workOrderValueINR, exactly like every other entry point
  // into this field (manual entry, Excel Import) already relies on.
  if (response.paymentMilestones.milestones.length > 0) {
    merged.paymentType = response.paymentMilestones.paymentType.value;
    merged.paymentMilestones = response.paymentMilestones.milestones.map((m) => ({
      id: crypto.randomUUID(),
      milestoneName: m.milestoneName.value,
      paymentPercentage: m.paymentPercentage.value,
      dueDate: m.dueDate.value || "",
      amount: 0,
    }));
  }

  return normalizeProject(merged);
}
