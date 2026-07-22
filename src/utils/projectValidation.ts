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
