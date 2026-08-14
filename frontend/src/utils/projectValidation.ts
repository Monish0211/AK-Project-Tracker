import type { Project } from "../types/Project";

export const validateGeneralTab = (project: Project): Record<string, string> => {
  const errors: Record<string, string> = {};

  if (!project.poMonth?.trim()) errors["poMonth"] = "PO Month is required.";
  if (!project.prCategory?.trim()) errors["prCategory"] = "PR Category is required.";
  if (!project.prNo?.trim()) errors["prNo"] = "PR Number is required.";
  if (!project.projectTitle?.trim()) errors["projectTitle"] = "Project Title is required.";
  if (!project.client?.trim()) errors["client"] = "Client Name is required.";
  if (!project.department?.trim()) errors["department"] = "Department is required.";
  if (!project.domesticForeign?.trim()) errors["domesticForeign"] = "Domestic / Foreign is required.";
  if (!project.workOrderStatus?.trim()) errors["workOrderStatus"] = "Work Order Status is required.";
  if (!project.projectStatus?.trim()) errors["projectStatus"] = "Project Status is required.";
  if (!project.projectStartDate?.trim()) errors["projectStartDate"] = "Project Start Date is required.";
  if (!project.contractType?.trim()) errors["contractType"] = "Contract Type is required.";
  if (!project.pmoCoordinator?.trim()) errors["pmoCoordinator"] = "PMO Coordinator is required.";
  if (!project.workOrderNumber?.trim()) errors["workOrderNumber"] = "Work Order Number is required.";
  if (!project.workOrderDate?.trim()) errors["workOrderDate"] = "Work Order Date is required.";
  if (!project.eicName?.trim()) errors["eicName"] = "EIC Name is required.";

  return errors;
};

export const validateQuantityTab = (project: Project): Record<string, string> => {
  const errors: Record<string, string> = {};

  if (!project.currency?.trim()) errors["currency"] = "Currency is required.";
  
  if (project.currency !== "INR" && (!project.currentExchangeRate || project.currentExchangeRate <= 0)) {
    errors["exchangeRate"] = "Exchange Rate is required.";
  }

  project.quantityItems.forEach((item, index) => {
    if (!item.description?.trim()) {
      errors[`qty_desc_${index}`] = "Description is required.";
    }
    if (item.woQty === undefined || item.woQty <= 0) {
      errors[`qty_qty_${index}`] = "Quantity must be greater than 0.";
    }
    if (!item.uom?.trim()) {
      errors[`qty_uom_${index}`] = "UOM is required.";
    }
    if (item.unitRate === undefined || item.unitRate <= 0) {
      errors[`qty_rate_${index}`] = "Unit Rate must be greater than 0.";
    }
  });

  return errors;
};

/**
 * Expense Budget has no required-field markers in ExpenseBudgetCard.tsx
 * today (Budget Amount/Hours/Remarks are all optional planning inputs) — so
 * there is nothing to reject yet. This still exists as its own gate (per
 * the Phase 3.5 design, matching validateQuantityTab/
 * validatePaymentMilestonesTab's role of gating that tab's backend sync)
 * rather than being skipped, so a future required-field rule has a home
 * without inventing a new validator wiring path.
 */
export const validateExpenseBudgetTab = (_project: Project): Record<string, string> => {
  return {};
};

/**
 * Other Project Expenses validates each row at the point of entry —
 * NonManhourExpenseModal.tsx already blocks Save unless category,
 * description, quantity > 0, and unitCost > 0 all pass, so nothing invalid
 * can ever reach project.nonManhourExpenses in the first place. This
 * tab-level gate exists to match validateQuantityTab/
 * validatePaymentMilestonesTab's role of gating FormButtons.tsx's backend
 * sync call, not to re-validate rows the modal already guaranteed are
 * complete.
 */
export const validateOtherExpensesTab = (_project: Project): Record<string, string> => {
  return {};
};

export const validatePaymentMilestonesTab = (project: Project): Record<string, string> => {
  const errors: Record<string, string> = {};

  if (project.paymentType === "Single") {
    const single = project.paymentMilestones[0];
    if (!single?.milestoneName?.trim()) {
      errors["milestone_name_0"] = "Milestone Name is required.";
    }
    if (single?.paymentPercentage === undefined || single.paymentPercentage <= 0) {
      errors["milestone_pct_0"] = "Payment % must be greater than 0.";
    }
  } else {
    project.paymentMilestones.forEach((milestone, index) => {
      if (!milestone.milestoneName?.trim()) {
        errors[`milestone_name_${index}`] = "Milestone Name is required.";
      }
      if (milestone.paymentPercentage === undefined || milestone.paymentPercentage <= 0) {
        errors[`milestone_pct_${index}`] = "Payment % must be greater than 0.";
      }
    });
  }

  return errors;
};
