import type { Project } from "../../types/Project";
import type { InvoiceDocumentDetails } from "../../types/InvoiceDocument";
import { updateProject } from "../projectService";

// The current company defaults — used only to PRE-FILL a brand-new invoice
// cycle's Company Print Settings the first time its document is opened.
// Once saved (even unedited), a cycle's own snapshot in
// project.invoiceDocumentDetailsMap takes over permanently: editing these
// defaults later never rewrites an already-issued invoice's footer.
export const DEFAULT_COMPANY_PRINT_SETTINGS = {
  companyPan: "AAFFI1423E",
  bankName: "Union Bank of India",
  accountNo: "530601010038789",
  branch: "Anna Nagar",
  ifscCode: "UBIN0553069",
  companySignatureText: "for iFluids Engineering",
  authorisedSignatoryText: "AUTHORISED SIGNATORY",
};

export const invoiceDocumentService = {
  getSavedDocumentDetails(project: Project, invoiceNo: string): InvoiceDocumentDetails {
    const map = project.invoiceDocumentDetailsMap ?? {};
    if (map[invoiceNo]) {
      // Backfill any Company Print Settings fields missing from a record
      // saved before this feature existed — saved values always win where
      // present, this only fills genuine gaps.
      return { ...DEFAULT_COMPANY_PRINT_SETTINGS, ...map[invoiceNo] };
    }

    const formattedRefDate = project.projectStartDate
      ? new Date(project.projectStartDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })
      : "";

    // Dynamic initial buyer details derived cleanly from project model without hardcoded defaults
    const initialBuyerInfo = {
      companyName: project.client || "",
      billingAddress: "",
      gstin: "",
      stateName: "",
      stateCode: "",
      placeOfSupply: "",
      contactPerson: project.eicName || "",
      contactNumber: project.contactNumber || "",
      email: project.emailId || "",
    };

    return {
      invoiceNoCustom: invoiceNo,
      referenceNoAndDate: `${invoiceNo} dt. ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}`,
      buyersOrderNo: project.workOrderNumber || "",
      buyersOrderDate: formattedRefDate,
      paymentTerms: project.paymentTerms || "30 Days",
      otherReferences: `Internal PR No : ${project.prNo || "-"}`,
      referenceDate: formattedRefDate,
      termsOfDelivery: "As per contract milestones",
      dispatchThrough: "",
      deliveryNote: "",
      transportDetails: "",
      additionalNotes: "",
      buyerInformation: initialBuyerInfo,
      ...DEFAULT_COMPANY_PRINT_SETTINGS,
    };
  },

  saveDocumentDetails(
    project: Project,
    invoiceNo: string,
    details: InvoiceDocumentDetails
  ): Project {
    const map = { ...(project.invoiceDocumentDetailsMap ?? {}) };
    map[invoiceNo] = details;

    const updatedProject: Project = {
      ...project,
      invoiceDocumentDetailsMap: map,
      updatedAt: new Date().toISOString(),
    };

    updateProject(updatedProject);
    return updatedProject;
  },
};
