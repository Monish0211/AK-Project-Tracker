import type { Project } from "../../types/Project";
import type { PRRequestProjectData } from "../../types/PRRequest";

/**
 * Converts the in-memory `Project`-shaped draft object (the exact same type
 * Add Project itself edits — see RequestPRForm.tsx for why the same
 * GeneralInfoCard/QuantityCard/PaymentMilestoneCard/ExpenseBudgetCard
 * components are reused unchanged) into the flat payload the backend's
 * prRequestProjectDataSchema validates. Strips every field the backend
 * never accepts (ids, and every server-derived Quantity/Milestone value —
 * unitRateINR/woValue/invoiceQty/pendingQty/pendingAmount/amount) rather
 * than sending them and relying on the backend to silently ignore extras.
 */
export function projectToDraftPayload(project: Project): PRRequestProjectData {
  return {
    poMonth: project.poMonth,
    prCategory: project.prCategory,
    prNo: project.prNo,
    client: project.client,
    department: project.department,
    domesticForeign: project.domesticForeign,
    projectTitle: project.projectTitle,
    workOrderStatus: project.workOrderStatus,
    projectStartDate: project.projectStartDate,
    projectEndDate: project.projectEndDate || null,
    projectStatus: project.projectStatus,
    workOrderNumber: project.workOrderNumber || "",
    workOrderDate: project.workOrderDate || "",
    eicName: project.eicName || "",
    contactNumber: project.contactNumber || null,
    emailId: project.emailId || null,
    estimatedDuration: project.estimatedDuration ?? null,
    durationUnit: project.durationUnit ?? null,
    contractType: project.contractType,
    pmoCoordinator: project.pmoCoordinator || "",
    ...(project.pmoCoordinatorEntryId ? { pmoCoordinatorEntryId: project.pmoCoordinatorEntryId } : {}),
    paymentType: project.paymentType,
    gstApplicable: project.gstApplicable,
    currency: project.currency,
    currentExchangeRate: project.currentExchangeRate,
    contractExchangeRate: project.contractExchangeRate,
    manhourBudgetAmount: project.manhourBudgetAmount ?? null,
    manhourBudgetHours: project.manhourBudgetHours ?? null,
    manhourBudgetRemarks: project.manhourBudgetRemarks ?? null,
    nonManhourBudgetAmount: project.nonManhourBudgetAmount ?? null,
    nonManhourBudgetRemarks: project.nonManhourBudgetRemarks ?? null,
    remarks: project.remarks ?? null,
    quantityItems: project.quantityItems.map((item) => ({
      description: item.description,
      woQty: item.woQty,
      uom: item.uom,
      assignedTo: item.assignedTo || null,
      currency: item.currency,
      unitRate: item.unitRate,
      exchangeRate: item.exchangeRate,
    })),
    paymentMilestones: project.paymentMilestones.map((m) => ({
      milestoneName: m.milestoneName || "",
      paymentPercentage: m.paymentPercentage,
      dueDate: m.dueDate || null,
    })),
  };
}

/**
 * The reverse mapping — loading an existing Draft back into the same
 * `Project`-shaped in-memory object the form edits, layered onto
 * createEmptyProject()'s defaults so every field the Draft payload doesn't
 * carry (e.g. computed unitRateINR/woValue) still has a sane starting
 * value the form's own live-recalculation (recalcQuantityItem, etc.) can
 * take over from immediately.
 */
export function draftPayloadToProject(base: Project, data: PRRequestProjectData): Project {
  return {
    ...base,
    poMonth: data.poMonth,
    prCategory: data.prCategory,
    prNo: data.prNo,
    client: data.client,
    department: data.department,
    domesticForeign: data.domesticForeign,
    projectTitle: data.projectTitle,
    workOrderStatus: data.workOrderStatus,
    projectStartDate: data.projectStartDate,
    projectEndDate: data.projectEndDate ?? "",
    projectStatus: data.projectStatus,
    workOrderNumber: data.workOrderNumber ?? "",
    workOrderDate: data.workOrderDate ?? "",
    eicName: data.eicName ?? "",
    contactNumber: data.contactNumber ?? undefined,
    emailId: data.emailId ?? undefined,
    estimatedDuration: data.estimatedDuration ?? undefined,
    durationUnit: data.durationUnit ?? undefined,
    contractType: data.contractType,
    pmoCoordinator: data.pmoCoordinator ?? "",
    pmoCoordinatorEntryId: data.pmoCoordinatorEntryId ?? undefined,
    paymentType: data.paymentType,
    gstApplicable: data.gstApplicable,
    currency: data.currency,
    currentExchangeRate: data.currentExchangeRate,
    contractExchangeRate: data.contractExchangeRate,
    manhourBudgetAmount: data.manhourBudgetAmount ?? undefined,
    manhourBudgetHours: data.manhourBudgetHours ?? undefined,
    manhourBudgetRemarks: data.manhourBudgetRemarks ?? undefined,
    nonManhourBudgetAmount: data.nonManhourBudgetAmount ?? undefined,
    nonManhourBudgetRemarks: data.nonManhourBudgetRemarks ?? undefined,
    remarks: data.remarks ?? "",
    quantityItems:
      data.quantityItems && data.quantityItems.length > 0
        ? data.quantityItems.map((item, index) => ({
            id: `draft-qty-${index}`,
            description: item.description,
            woQty: item.woQty,
            invoiceQty: 0,
            pendingQty: item.woQty,
            uom: item.uom,
            assignedTo: item.assignedTo ?? undefined,
            currency: item.currency,
            unitRate: item.unitRate,
            exchangeRate: item.exchangeRate,
            unitRateINR: item.currency === "INR" ? item.unitRate : item.unitRate * item.exchangeRate,
            woValue: item.uom === "LUMP SUM" ? item.unitRate : item.woQty * item.unitRate,
            pendingAmount: 0,
          }))
        : base.quantityItems,
    paymentMilestones:
      data.paymentMilestones && data.paymentMilestones.length > 0
        ? data.paymentMilestones.map((m, index) => ({
            id: `draft-milestone-${index}`,
            milestoneName: m.milestoneName,
            paymentPercentage: m.paymentPercentage,
            dueDate: m.dueDate ?? "",
            amount: 0,
          }))
        : base.paymentMilestones,
  };
}
