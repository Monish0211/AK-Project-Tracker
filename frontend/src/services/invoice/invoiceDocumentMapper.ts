import type { Project } from "../../types/Project";
import type { InvoiceDocumentDTO, InvoiceDocumentDetails, InvoiceDocumentLineItem } from "../../types/InvoiceDocument";
import {
  getInvoiceCycleStatus,
  getInvoiceCyclesForProject,
  getMilestonesForProject,
  getMlmpSetLabel,
  round,
} from "../../pages/Projects/components/Invoice/InvoiceCalculations";
import { numberToIndianWords } from "./numberToWords";

/**
 * Quantity Billing's PDF/print mapper — UNCHANGED. Reads line items strictly
 * from InvoiceLine.quantityBilled/unitPriceINR (`quantityBilled > 0` is the
 * inclusion filter), exactly as before. Lump Sum invoices must never pass
 * through this function — see mapProjectToLumpSumInvoiceDocumentDTO below,
 * a fully independent mapper with its own line-item/subtotal derivation, so
 * a Lump Sum document (whose lines always have quantityBilled === 0, by
 * design) can never silently produce a ₹0 PDF by falling through here.
 */
export function mapProjectToInvoiceDocumentDTO(
  project: Project,
  invoiceNo: string,
  details: InvoiceDocumentDetails
): InvoiceDocumentDTO {
  const items = Array.isArray(project.invoiceItems) ? project.invoiceItems : [];
  
  // Find cycle label (e.g., "Invoice 1")
  const cycles = getInvoiceCyclesForProject(project);
  const matchedCycle = cycles.find((c) => c.invoiceNo === invoiceNo);
  const cycleLabel = matchedCycle?.label || "Invoice";
  const invoiceStatus = getInvoiceCycleStatus(project, invoiceNo);

  // Extract non-zero billed lines under this invoiceNo
  const documentLines: InvoiceDocumentLineItem[] = [];
  let slNo = 1;
  let subtotal = 0;
  let firstLineDate = "";

  items.forEach((item) => {
    (Array.isArray(item.invoices) ? item.invoices : []).forEach((line) => {
      if (line.invoiceNo === invoiceNo && line.status !== "Cancelled" && line.quantityBilled > 0) {
        if (!firstLineDate && line.invoiceDate) {
          firstLineDate = line.invoiceDate;
        }

        const unitRate = line.unitPriceINR ?? item.unitPrice;
        const lineAmount = line.invoiceAmountINR;
        subtotal += lineAmount;

        documentLines.push({
          slNo: slNo++,
          activityName: item.description,
          descriptionNotes: line.milestoneName || line.description || "",
          hsnSac: "998399", // Standard Engineering & Consulting HSN/SAC Code
          gstRatePercent: project.gstRate || 18,
          basicUnitRateINR: unitRate,
          uom: item.uom || "MAN-HOUR",
          quantity: line.quantityBilled,
          amountINR: lineAmount,
        });
      }
    });
  });

  subtotal = round(subtotal);

  // Determine GST applicability
  const isGstApplicable = Boolean(project.gstApplicable);
  const gstRate = isGstApplicable ? (project.gstRate || 18) : 0;
  const buyerInfo = details.buyerInformation || {
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

  const isInterState = Boolean(
    buyerInfo.stateName && !buyerInfo.stateName.toLowerCase().includes("tamil nadu")
  );

  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  let totalTax = 0;

  if (isGstApplicable) {
    if (isInterState) {
      igst = round(subtotal * (gstRate / 100));
      totalTax = igst;
    } else {
      cgst = round(subtotal * (gstRate / 200));
      sgst = round(subtotal * (gstRate / 200));
      totalTax = round(cgst + sgst);
    }
  }

  const grandTotal = round(subtotal + totalTax);

  // Formatted date helper
  const formattedInvoiceDate = firstLineDate
    ? new Date(firstLineDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })
    : new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });

  const formattedRefDate = project.projectStartDate
    ? new Date(project.projectStartDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })
    : "";

  return {
    projectPRNo: project.prNo || "-",
    invoiceCycleNo: invoiceNo,
    cycleLabel,
    invoiceStatus,
    isGstApplicable,
    billingMethod: "invoice_line_items",

    // Header Company Info
    companyName: "iFluids Engineering",
    companyAddress: "VP BUSINESS CENTRE, No. 20(42), 7th Cross Street, West Shenoy Nagar, Chennai, Pin Code - 600030",
    companyGstin: "33AAFFI1423E1Z1",
    companyState: "Tamil Nadu",
    companyStateCode: "33",
    companyEmail: "info@ifluids.com",
    companyPan: details.companyPan || "AAFFI1423E",

    // Reference Info
    invoiceNoCustom: details.invoiceNoCustom || invoiceNo,
    invoiceDate: formattedInvoiceDate,
    referenceNoAndDate: details.referenceNoAndDate || `${details.invoiceNoCustom || invoiceNo} dt. ${formattedInvoiceDate}`,
    paymentTerms: details.paymentTerms || project.paymentTerms || "30 Days",
    buyersOrderNo: details.buyersOrderNo || project.workOrderNumber || "",
    buyersOrderDate: details.buyersOrderDate || formattedRefDate || formattedInvoiceDate,
    otherReferences: details.otherReferences || `Internal PR No : ${project.prNo || "-"}`,
    referenceDate: details.referenceDate || formattedRefDate,
    termsOfDelivery: details.termsOfDelivery || "As per agreed contract milestones",

    // Buyer Info (Dynamic from editable buyerInformation DTO)
    buyerName: buyerInfo.companyName || "—",
    buyerAddress: buyerInfo.billingAddress || "—",
    buyerGstin: buyerInfo.gstin || "—",
    buyerState: buyerInfo.stateName || "—",
    buyerStateCode: buyerInfo.stateCode || "—",
    buyerPlaceOfSupply: buyerInfo.placeOfSupply || "—",
    buyerContactPerson: buyerInfo.contactPerson || "—",
    buyerContactPhone: buyerInfo.contactNumber || "—",
    buyerContactEmail: buyerInfo.email || "—",

    // Line Items & Totals
    lineItems: documentLines,
    subtotalINR: subtotal,
    taxRatePercent: gstRate,
    isInterState,
    cgstAmountINR: cgst,
    sgstAmountINR: sgst,
    igstAmountINR: igst,
    totalTaxINR: totalTax,
    grandTotalINR: grandTotal,

    // Words
    amountInWords: numberToIndianWords(grandTotal),
    taxAmountInWords: isGstApplicable ? numberToIndianWords(totalTax) : "NIL",

    // Bank Info
    bankName: details.bankName || "Union Bank of India",
    accountNo: details.accountNo || "530601010038789",
    branchAndIfsc: `${details.branch || "Anna Nagar"} & ${details.ifscCode || "UBIN0553069"}`,

    // Signature Block
    companySignatureText: details.companySignatureText || "for iFluids Engineering",
    authorisedSignatoryText: details.authorisedSignatoryText || "AUTHORISED SIGNATORY",
  };
}

/**
 * Lump Sum Billing's PDF/print mapper — fully independent of the Quantity
 * Billing mapper above. Lump Sum invoice lines always carry
 * `quantityBilled: 0` (that's how the Lump Sum Raise Invoice workspace
 * saves them — see LumpSumInvoiceWorkspaceModal), so passing them through
 * the qty mapper's `quantityBilled > 0` filter silently drops every line,
 * which is exactly what produced the reported "Total = ₹0" bug. This
 * function never reads quantityBilled/unitPriceINR at all: one printable
 * line per DISTINCT milestone billed under this cycle, its amount being
 * the SUM of that milestone's per-activity proportional shares (the same
 * total the Lump Sum workspace's own "Invoice Amount" already shows) — the
 * saved invoice record is the sole source of truth, never a live
 * recalculation from Quantity Details.
 */
export function mapProjectToLumpSumInvoiceDocumentDTO(
  project: Project,
  invoiceNo: string,
  details: InvoiceDocumentDetails
): InvoiceDocumentDTO {
  const items = Array.isArray(project.invoiceItems) ? project.invoiceItems : [];
  const milestones = getMilestonesForProject(project);

  const cycles = getInvoiceCyclesForProject(project);
  const matchedCycle = cycles.find((c) => c.invoiceNo === invoiceNo);
  const cycleLabel = matchedCycle?.label || "Invoice";
  const invoiceStatus = getInvoiceCycleStatus(project, invoiceNo);

  // Sum each milestone's already-saved invoiceAmountINR across every
  // activity's proportional share — never recomputed from qty/unit rate.
  const amountByMilestoneId = new Map<string, number>();
  let firstLineDate = "";

  items.forEach((item) => {
    (Array.isArray(item.invoices) ? item.invoices : []).forEach((line) => {
      if (line.invoiceNo !== invoiceNo || line.status === "Cancelled" || !line.milestoneId) return;
      amountByMilestoneId.set(
        line.milestoneId,
        round((amountByMilestoneId.get(line.milestoneId) || 0) + line.invoiceAmountINR)
      );
      if (!firstLineDate && line.invoiceDate) firstLineDate = line.invoiceDate;
    });
  });

  const documentLines: InvoiceDocumentLineItem[] = [];
  let slNo = 1;
  let subtotal = 0;

  milestones.forEach((milestone) => {
    const amount = amountByMilestoneId.get(milestone.id);
    if (amount === undefined || amount <= 0) return; // not part of this invoice
    subtotal = round(subtotal + amount);
    documentLines.push({
      slNo: slNo++,
      activityName: milestone.label,
      milestonePercent: milestone.percent,
      amountINR: round(amount),
    });
  });

  const isGstApplicable = Boolean(project.gstApplicable);
  const gstRate = isGstApplicable ? project.gstRate || 18 : 0;

  const buyerInfo = details.buyerInformation || {
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

  const isInterState = Boolean(buyerInfo.stateName && !buyerInfo.stateName.toLowerCase().includes("tamil nadu"));

  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  let totalTax = 0;

  if (isGstApplicable) {
    if (isInterState) {
      igst = round(subtotal * (gstRate / 100));
      totalTax = igst;
    } else {
      cgst = round(subtotal * (gstRate / 200));
      sgst = round(subtotal * (gstRate / 200));
      totalTax = round(cgst + sgst);
    }
  }

  const grandTotal = round(subtotal + totalTax);

  const formattedInvoiceDate = firstLineDate
    ? new Date(firstLineDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })
    : new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });

  const formattedRefDate = project.projectStartDate
    ? new Date(project.projectStartDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })
    : "";

  return {
    projectPRNo: project.prNo || "-",
    invoiceCycleNo: invoiceNo,
    cycleLabel,
    invoiceStatus,
    isGstApplicable,
    billingMethod: "lump_sum",

    // Header Company Info
    companyName: "iFluids Engineering",
    companyAddress: "VP BUSINESS CENTRE, No. 20(42), 7th Cross Street, West Shenoy Nagar, Chennai, Pin Code - 600030",
    companyGstin: "33AAFFI1423E1Z1",
    companyState: "Tamil Nadu",
    companyStateCode: "33",
    companyEmail: "info@ifluids.com",
    companyPan: details.companyPan || "AAFFI1423E",

    // Reference Info
    invoiceNoCustom: details.invoiceNoCustom || invoiceNo,
    invoiceDate: formattedInvoiceDate,
    referenceNoAndDate: details.referenceNoAndDate || `${details.invoiceNoCustom || invoiceNo} dt. ${formattedInvoiceDate}`,
    paymentTerms: details.paymentTerms || project.paymentTerms || "30 Days",
    buyersOrderNo: details.buyersOrderNo || project.workOrderNumber || "",
    buyersOrderDate: details.buyersOrderDate || formattedRefDate || formattedInvoiceDate,
    otherReferences: details.otherReferences || `Internal PR No : ${project.prNo || "-"}`,
    referenceDate: details.referenceDate || formattedRefDate,
    termsOfDelivery: details.termsOfDelivery || "As per agreed contract milestones",

    // Buyer Info
    buyerName: buyerInfo.companyName || "—",
    buyerAddress: buyerInfo.billingAddress || "—",
    buyerGstin: buyerInfo.gstin || "—",
    buyerState: buyerInfo.stateName || "—",
    buyerStateCode: buyerInfo.stateCode || "—",
    buyerPlaceOfSupply: buyerInfo.placeOfSupply || "—",
    buyerContactPerson: buyerInfo.contactPerson || "—",
    buyerContactPhone: buyerInfo.contactNumber || "—",
    buyerContactEmail: buyerInfo.email || "—",

    // Line Items & Totals — one row per distinct milestone, never quantity-derived
    lineItems: documentLines,
    subtotalINR: subtotal,
    taxRatePercent: gstRate,
    isInterState,
    cgstAmountINR: cgst,
    sgstAmountINR: sgst,
    igstAmountINR: igst,
    totalTaxINR: totalTax,
    grandTotalINR: grandTotal,

    // Words — always derived from the Grand Total, never a qty calculation
    amountInWords: numberToIndianWords(grandTotal),
    taxAmountInWords: isGstApplicable ? numberToIndianWords(totalTax) : "NIL",

    // Bank Info
    bankName: details.bankName || "Union Bank of India",
    accountNo: details.accountNo || "530601010038789",
    branchAndIfsc: `${details.branch || "Anna Nagar"} & ${details.ifscCode || "UBIN0553069"}`,

    // Signature Block
    companySignatureText: details.companySignatureText || "for iFluids Engineering",
    authorisedSignatoryText: details.authorisedSignatoryText || "AUTHORISED SIGNATORY",
  };
}

/**
 * MLMP Billing's PDF/print mapper — fully independent of both mappers above.
 * MLMP invoice lines carry `quantityBilled: 0` and a `setIndex`, so the qty
 * mapper's `quantityBilled > 0` filter would drop every line, same failure
 * mode the Lump Sum mapper was built to avoid. Unlike Lump Sum (which dedupes
 * one printable row per DISTINCT milestone across every activity), MLMP
 * prints one row per (Activity, SET, Milestone) line actually saved under
 * this cycle — the same milestone id legitimately repeats across many
 * SETs/activities within one invoice, and each occurrence is a genuinely
 * distinct billed amount, never a duplicate to collapse.
 */
export function mapProjectToMlmpInvoiceDocumentDTO(
  project: Project,
  invoiceNo: string,
  details: InvoiceDocumentDetails
): InvoiceDocumentDTO {
  const items = Array.isArray(project.invoiceItems) ? project.invoiceItems : [];
  // Same source as Lump Sum — there is no separate MLMP milestone template.
  const milestones = getMilestonesForProject(project);

  const cycles = getInvoiceCyclesForProject(project);
  const matchedCycle = cycles.find((c) => c.invoiceNo === invoiceNo);
  const cycleLabel = matchedCycle?.label || "Invoice";
  const invoiceStatus = getInvoiceCycleStatus(project, invoiceNo);

  const documentLines: InvoiceDocumentLineItem[] = [];
  let slNo = 1;
  let subtotal = 0;
  let firstLineDate = "";

  items.forEach((item) => {
    (Array.isArray(item.invoices) ? item.invoices : []).forEach((line) => {
      if (line.invoiceNo !== invoiceNo || line.status === "Cancelled" || line.setIndex === undefined) return;
      if (!firstLineDate && line.invoiceDate) firstLineDate = line.invoiceDate;

      const percent = milestones.find((m) => m.id === line.milestoneId)?.percent;
      const amount = round(line.invoiceAmountINR);
      subtotal = round(subtotal + amount);

      documentLines.push({
        slNo: slNo++,
        activityName: item.description,
        descriptionNotes: line.milestoneName || line.description || "",
        setLabel: `${getMlmpSetLabel(item)} ${line.setIndex}`,
        milestonePercent: percent,
        amountINR: amount,
      });
    });
  });

  const isGstApplicable = Boolean(project.gstApplicable);
  const gstRate = isGstApplicable ? project.gstRate || 18 : 0;

  const buyerInfo = details.buyerInformation || {
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

  const isInterState = Boolean(buyerInfo.stateName && !buyerInfo.stateName.toLowerCase().includes("tamil nadu"));

  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  let totalTax = 0;

  if (isGstApplicable) {
    if (isInterState) {
      igst = round(subtotal * (gstRate / 100));
      totalTax = igst;
    } else {
      cgst = round(subtotal * (gstRate / 200));
      sgst = round(subtotal * (gstRate / 200));
      totalTax = round(cgst + sgst);
    }
  }

  const grandTotal = round(subtotal + totalTax);

  const formattedInvoiceDate = firstLineDate
    ? new Date(firstLineDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })
    : new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });

  const formattedRefDate = project.projectStartDate
    ? new Date(project.projectStartDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })
    : "";

  return {
    projectPRNo: project.prNo || "-",
    invoiceCycleNo: invoiceNo,
    cycleLabel,
    invoiceStatus,
    isGstApplicable,
    billingMethod: "mlmp",

    // Header Company Info
    companyName: "iFluids Engineering",
    companyAddress: "VP BUSINESS CENTRE, No. 20(42), 7th Cross Street, West Shenoy Nagar, Chennai, Pin Code - 600030",
    companyGstin: "33AAFFI1423E1Z1",
    companyState: "Tamil Nadu",
    companyStateCode: "33",
    companyEmail: "info@ifluids.com",
    companyPan: details.companyPan || "AAFFI1423E",

    // Reference Info
    invoiceNoCustom: details.invoiceNoCustom || invoiceNo,
    invoiceDate: formattedInvoiceDate,
    referenceNoAndDate: details.referenceNoAndDate || `${details.invoiceNoCustom || invoiceNo} dt. ${formattedInvoiceDate}`,
    paymentTerms: details.paymentTerms || project.paymentTerms || "30 Days",
    buyersOrderNo: details.buyersOrderNo || project.workOrderNumber || "",
    buyersOrderDate: details.buyersOrderDate || formattedRefDate || formattedInvoiceDate,
    otherReferences: details.otherReferences || `Internal PR No : ${project.prNo || "-"}`,
    referenceDate: details.referenceDate || formattedRefDate,
    termsOfDelivery: details.termsOfDelivery || "As per agreed contract milestones",

    // Buyer Info
    buyerName: buyerInfo.companyName || "—",
    buyerAddress: buyerInfo.billingAddress || "—",
    buyerGstin: buyerInfo.gstin || "—",
    buyerState: buyerInfo.stateName || "—",
    buyerStateCode: buyerInfo.stateCode || "—",
    buyerPlaceOfSupply: buyerInfo.placeOfSupply || "—",
    buyerContactPerson: buyerInfo.contactPerson || "—",
    buyerContactPhone: buyerInfo.contactNumber || "—",
    buyerContactEmail: buyerInfo.email || "—",

    // Line Items & Totals — one row per (Activity, SET, Milestone) line actually saved
    lineItems: documentLines,
    subtotalINR: subtotal,
    taxRatePercent: gstRate,
    isInterState,
    cgstAmountINR: cgst,
    sgstAmountINR: sgst,
    igstAmountINR: igst,
    totalTaxINR: totalTax,
    grandTotalINR: grandTotal,

    // Words — always derived from the Grand Total, never a qty calculation
    amountInWords: numberToIndianWords(grandTotal),
    taxAmountInWords: isGstApplicable ? numberToIndianWords(totalTax) : "NIL",

    // Bank Info
    bankName: details.bankName || "Union Bank of India",
    accountNo: details.accountNo || "530601010038789",
    branchAndIfsc: `${details.branch || "Anna Nagar"} & ${details.ifscCode || "UBIN0553069"}`,

    // Signature Block
    companySignatureText: details.companySignatureText || "for iFluids Engineering",
    authorisedSignatoryText: details.authorisedSignatoryText || "AUTHORISED SIGNATORY",
  };
}

/**
 * Amount Based's PDF/print mapper — the simplest of the four, fully
 * independent of the others. Amount Based invoice lines carry
 * `quantityBilled: 0` and no milestoneId/setIndex at all — one printable row
 * per (Activity) line actually saved under this cycle, showing only the
 * activity name and its billed amount (no HSN/SAC, GST%, rate, qty,
 * milestone %, or SET — none of those concepts exist for this method).
 */
export function mapProjectToAmountBasedInvoiceDocumentDTO(
  project: Project,
  invoiceNo: string,
  details: InvoiceDocumentDetails
): InvoiceDocumentDTO {
  const items = Array.isArray(project.invoiceItems) ? project.invoiceItems : [];

  const cycles = getInvoiceCyclesForProject(project);
  const matchedCycle = cycles.find((c) => c.invoiceNo === invoiceNo);
  const cycleLabel = matchedCycle?.label || "Invoice";
  const invoiceStatus = getInvoiceCycleStatus(project, invoiceNo);

  const documentLines: InvoiceDocumentLineItem[] = [];
  let slNo = 1;
  let subtotal = 0;
  let firstLineDate = "";

  items.forEach((item) => {
    (Array.isArray(item.invoices) ? item.invoices : []).forEach((line) => {
      if (line.invoiceNo !== invoiceNo || line.status === "Cancelled" || line.invoiceAmountINR <= 0) return;
      if (!firstLineDate && line.invoiceDate) firstLineDate = line.invoiceDate;

      const amount = round(line.invoiceAmountINR);
      subtotal = round(subtotal + amount);

      documentLines.push({
        slNo: slNo++,
        activityName: item.description,
        amountINR: amount,
      });
    });
  });

  const isGstApplicable = Boolean(project.gstApplicable);
  const gstRate = isGstApplicable ? project.gstRate || 18 : 0;

  const buyerInfo = details.buyerInformation || {
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

  const isInterState = Boolean(buyerInfo.stateName && !buyerInfo.stateName.toLowerCase().includes("tamil nadu"));

  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  let totalTax = 0;

  if (isGstApplicable) {
    if (isInterState) {
      igst = round(subtotal * (gstRate / 100));
      totalTax = igst;
    } else {
      cgst = round(subtotal * (gstRate / 200));
      sgst = round(subtotal * (gstRate / 200));
      totalTax = round(cgst + sgst);
    }
  }

  const grandTotal = round(subtotal + totalTax);

  const formattedInvoiceDate = firstLineDate
    ? new Date(firstLineDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })
    : new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });

  const formattedRefDate = project.projectStartDate
    ? new Date(project.projectStartDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })
    : "";

  return {
    projectPRNo: project.prNo || "-",
    invoiceCycleNo: invoiceNo,
    cycleLabel,
    invoiceStatus,
    isGstApplicable,
    billingMethod: "amount_based",

    // Header Company Info
    companyName: "iFluids Engineering",
    companyAddress: "VP BUSINESS CENTRE, No. 20(42), 7th Cross Street, West Shenoy Nagar, Chennai, Pin Code - 600030",
    companyGstin: "33AAFFI1423E1Z1",
    companyState: "Tamil Nadu",
    companyStateCode: "33",
    companyEmail: "info@ifluids.com",
    companyPan: details.companyPan || "AAFFI1423E",

    // Reference Info
    invoiceNoCustom: details.invoiceNoCustom || invoiceNo,
    invoiceDate: formattedInvoiceDate,
    referenceNoAndDate: details.referenceNoAndDate || `${details.invoiceNoCustom || invoiceNo} dt. ${formattedInvoiceDate}`,
    paymentTerms: details.paymentTerms || project.paymentTerms || "30 Days",
    buyersOrderNo: details.buyersOrderNo || project.workOrderNumber || "",
    buyersOrderDate: details.buyersOrderDate || formattedRefDate || formattedInvoiceDate,
    otherReferences: details.otherReferences || `Internal PR No : ${project.prNo || "-"}`,
    referenceDate: details.referenceDate || formattedRefDate,
    termsOfDelivery: details.termsOfDelivery || "As per agreed contract milestones",

    // Buyer Info
    buyerName: buyerInfo.companyName || "—",
    buyerAddress: buyerInfo.billingAddress || "—",
    buyerGstin: buyerInfo.gstin || "—",
    buyerState: buyerInfo.stateName || "—",
    buyerStateCode: buyerInfo.stateCode || "—",
    buyerPlaceOfSupply: buyerInfo.placeOfSupply || "—",
    buyerContactPerson: buyerInfo.contactPerson || "—",
    buyerContactPhone: buyerInfo.contactNumber || "—",
    buyerContactEmail: buyerInfo.email || "—",

    // Line Items & Totals — one row per Activity line actually saved, no milestone/qty/rate at all
    lineItems: documentLines,
    subtotalINR: subtotal,
    taxRatePercent: gstRate,
    isInterState,
    cgstAmountINR: cgst,
    sgstAmountINR: sgst,
    igstAmountINR: igst,
    totalTaxINR: totalTax,
    grandTotalINR: grandTotal,

    // Words — always derived from the Grand Total, never a qty calculation
    amountInWords: numberToIndianWords(grandTotal),
    taxAmountInWords: isGstApplicable ? numberToIndianWords(totalTax) : "NIL",

    // Bank Info
    bankName: details.bankName || "Union Bank of India",
    accountNo: details.accountNo || "530601010038789",
    branchAndIfsc: `${details.branch || "Anna Nagar"} & ${details.ifscCode || "UBIN0553069"}`,

    // Signature Block
    companySignatureText: details.companySignatureText || "for iFluids Engineering",
    authorisedSignatoryText: details.authorisedSignatoryText || "AUTHORISED SIGNATORY",
  };
}
