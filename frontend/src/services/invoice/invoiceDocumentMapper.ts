import type { Project } from "../../types/Project";
import type { InvoiceDocumentDTO, InvoiceDocumentDetails, InvoiceDocumentLineItem } from "../../types/InvoiceDocument";
import {
  getInvoiceCycleStatus,
  getInvoiceCyclesForProject,
  getMilestonesForProject,
  getMlmpSetLabel,
  computeGstTax,
  isGstApplicableForInvoice,
  isInterStateSupply,
  round,
  type GstTaxSplit,
} from "../../pages/Projects/components/Invoice/InvoiceCalculations";
import {
  getInvoiceCycleCurrency,
  getLineOriginalAmount,
  isForeignCurrency,
  roundToMinorUnit,
} from "../../pages/Projects/components/Invoice/invoiceCurrency";
import type { InvoiceCurrency } from "../../types/InvoiceItem";
import { numberToIndianWords } from "./numberToWords";
import { amountToCurrencyWords } from "./currencyWords";

/**
 * The currency/rate this invoice was saved in (every line of one invoice
 * shares them) — the document is printed in that currency. A legacy line
 * with no currency is INR at rate 1. Also feeds the shared GST rule, so a
 * foreign-currency invoice never prints GST.
 */
interface PrintCurrency {
  currency: InvoiceCurrency;
  exchangeRateToINR: number;
}

function getPrintCurrency(project: Project, invoiceNo: string): PrintCurrency {
  const saved = getInvoiceCycleCurrency(project, invoiceNo);
  if (!saved || !isForeignCurrency(saved.currency)) return { currency: "INR", exchangeRateToINR: 1 };
  return { currency: saved.currency, exchangeRateToINR: saved.exchangeRateToINR };
}

const NO_GST: GstTaxSplit = { cgst: 0, sgst: 0, igst: 0, totalTax: 0 };

/**
 * Totals in the invoice's own currency. INR: exactly the previous figures and
 * wording (original === INR). Foreign: the sum of the lines' saved original
 * amounts — never INR converted back — and no GST (isGstApplicableForInvoice()).
 */
function getCurrencyTotals(pc: PrintCurrency, subtotalINR: number, subtotalOriginal: number, grandTotalINR: number) {
  if (!isForeignCurrency(pc.currency)) {
    return { subtotalOriginal: subtotalINR, grandTotalOriginal: grandTotalINR, amountInWords: numberToIndianWords(grandTotalINR) };
  }
  const subtotal = roundToMinorUnit(subtotalOriginal, pc.currency);
  return { subtotalOriginal: subtotal, grandTotalOriginal: subtotal, amountInWords: amountToCurrencyWords(subtotal, pc.currency) };
}

/**
 * A line's printed amount in the invoice currency. INR: exactly the INR
 * figure the layout already prints (unchanged). Foreign: the line's saved
 * original amount, to that currency's precision.
 */
function lineAmountInInvoiceCurrency(line: Parameters<typeof getLineOriginalAmount>[0], amountINR: number, pc: PrintCurrency): number {
  return isForeignCurrency(pc.currency) ? roundToMinorUnit(getLineOriginalAmount(line), pc.currency) : amountINR;
}

/** A unit rate (INR) expressed in the invoice currency, to that currency's precision. INR unchanged. */
function unitRateInInvoiceCurrency(unitRateINR: number, pc: PrintCurrency): number {
  return isForeignCurrency(pc.currency) ? roundToMinorUnit(unitRateINR / pc.exchangeRateToINR, pc.currency) : unitRateINR;
}

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
  const printCurrency = getPrintCurrency(project, invoiceNo);
  
  // Find cycle label (e.g., "Invoice 1")
  const cycles = getInvoiceCyclesForProject(project);
  const matchedCycle = cycles.find((c) => c.invoiceNo === invoiceNo);
  const cycleLabel = matchedCycle?.label || "Invoice";
  const invoiceStatus = getInvoiceCycleStatus(project, invoiceNo);

  // Extract non-zero billed lines under this invoiceNo
  const documentLines: InvoiceDocumentLineItem[] = [];
  let slNo = 1;
  let subtotal = 0;
  let subtotalOriginal = 0;
  let firstLineDate = "";

  items.forEach((item) => {
    (Array.isArray(item.invoices) ? item.invoices : []).forEach((line) => {
      if (line.invoiceNo === invoiceNo && line.status !== "Cancelled" && line.quantityBilled > 0) {
        if (!firstLineDate && line.invoiceDate) {
          firstLineDate = line.invoiceDate;
        }

        const unitRate = line.unitPriceINR ?? item.unitPrice;
        const lineAmount = line.invoiceAmountINR;
        const lineOriginal = lineAmountInInvoiceCurrency(line, lineAmount, printCurrency);
        subtotal += lineAmount;
        subtotalOriginal += lineOriginal;

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
          amountOriginal: lineOriginal,
          basicUnitRateOriginal: unitRateInInvoiceCurrency(unitRate, printCurrency),
        });
      }
    });
  });

  subtotal = round(subtotal);

  // GST applicability — the same shared rule the Raise Invoice workspaces use
  const isGstApplicable = isGstApplicableForInvoice(project, printCurrency.currency);
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

  const isInterState = isInterStateSupply(buyerInfo.stateName);

  const { cgst, sgst, igst, totalTax } = isGstApplicable ? computeGstTax(subtotal, gstRate, isInterState) : NO_GST;

  const grandTotal = round(subtotal + totalTax);
  const currencyTotals = getCurrencyTotals(printCurrency, subtotal, subtotalOriginal, grandTotal);

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
    invoiceCurrency: printCurrency.currency,
    exchangeRateToINR: printCurrency.exchangeRateToINR,
    subtotalOriginal: currencyTotals.subtotalOriginal,
    grandTotalOriginal: currencyTotals.grandTotalOriginal,

    // Words
    amountInWords: currencyTotals.amountInWords,
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
  const printCurrency = getPrintCurrency(project, invoiceNo);
  const milestones = getMilestonesForProject(project);

  const cycles = getInvoiceCyclesForProject(project);
  const matchedCycle = cycles.find((c) => c.invoiceNo === invoiceNo);
  const cycleLabel = matchedCycle?.label || "Invoice";
  const invoiceStatus = getInvoiceCycleStatus(project, invoiceNo);

  // Sum each milestone's already-saved invoiceAmountINR across every
  // activity's proportional share — never recomputed from qty/unit rate.
  const amountByMilestoneId = new Map<string, number>();
  const originalByMilestoneId = new Map<string, number>();
  let firstLineDate = "";

  items.forEach((item) => {
    (Array.isArray(item.invoices) ? item.invoices : []).forEach((line) => {
      if (line.invoiceNo !== invoiceNo || line.status === "Cancelled" || !line.milestoneId) return;
      amountByMilestoneId.set(
        line.milestoneId,
        round((amountByMilestoneId.get(line.milestoneId) || 0) + line.invoiceAmountINR)
      );
      if (isForeignCurrency(printCurrency.currency)) {
        originalByMilestoneId.set(
          line.milestoneId,
          roundToMinorUnit((originalByMilestoneId.get(line.milestoneId) || 0) + getLineOriginalAmount(line), printCurrency.currency)
        );
      }
      if (!firstLineDate && line.invoiceDate) firstLineDate = line.invoiceDate;
    });
  });

  const documentLines: InvoiceDocumentLineItem[] = [];
  let slNo = 1;
  let subtotal = 0;
  let subtotalOriginal = 0;

  milestones.forEach((milestone) => {
    const amount = amountByMilestoneId.get(milestone.id);
    if (amount === undefined || amount <= 0) return; // not part of this invoice
    // INR: the printed INR amount itself (unchanged); foreign: the summed saved originals.
    const original = originalByMilestoneId.get(milestone.id) ?? round(amount);
    subtotal = round(subtotal + amount);
    subtotalOriginal += original;
    documentLines.push({
      slNo: slNo++,
      activityName: milestone.label,
      milestonePercent: milestone.percent,
      amountINR: round(amount),
      amountOriginal: original,
    });
  });

  const isGstApplicable = isGstApplicableForInvoice(project, printCurrency.currency);
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

  const isInterState = isInterStateSupply(buyerInfo.stateName);

  const { cgst, sgst, igst, totalTax } = isGstApplicable ? computeGstTax(subtotal, gstRate, isInterState) : NO_GST;

  const grandTotal = round(subtotal + totalTax);
  const currencyTotals = getCurrencyTotals(printCurrency, subtotal, subtotalOriginal, grandTotal);

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
    invoiceCurrency: printCurrency.currency,
    exchangeRateToINR: printCurrency.exchangeRateToINR,
    subtotalOriginal: currencyTotals.subtotalOriginal,
    grandTotalOriginal: currencyTotals.grandTotalOriginal,

    // Words — always derived from the Grand Total, never a qty calculation
    amountInWords: currencyTotals.amountInWords,
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
  const printCurrency = getPrintCurrency(project, invoiceNo);
  // Same source as Lump Sum — there is no separate MLMP milestone template.
  const milestones = getMilestonesForProject(project);

  const cycles = getInvoiceCyclesForProject(project);
  const matchedCycle = cycles.find((c) => c.invoiceNo === invoiceNo);
  const cycleLabel = matchedCycle?.label || "Invoice";
  const invoiceStatus = getInvoiceCycleStatus(project, invoiceNo);

  const documentLines: InvoiceDocumentLineItem[] = [];
  let slNo = 1;
  let subtotal = 0;
  let subtotalOriginal = 0;
  let firstLineDate = "";

  items.forEach((item) => {
    (Array.isArray(item.invoices) ? item.invoices : []).forEach((line) => {
      if (line.invoiceNo !== invoiceNo || line.status === "Cancelled" || line.setIndex === undefined) return;
      if (!firstLineDate && line.invoiceDate) firstLineDate = line.invoiceDate;

      const percent = milestones.find((m) => m.id === line.milestoneId)?.percent;
      const amount = round(line.invoiceAmountINR);
      const original = lineAmountInInvoiceCurrency(line, amount, printCurrency);
      subtotal = round(subtotal + amount);
      subtotalOriginal += original;

      documentLines.push({
        slNo: slNo++,
        activityName: item.description,
        descriptionNotes: line.milestoneName || line.description || "",
        setLabel: `${getMlmpSetLabel(item)} ${line.setIndex}`,
        milestonePercent: percent,
        amountINR: amount,
        amountOriginal: original,
      });
    });
  });

  const isGstApplicable = isGstApplicableForInvoice(project, printCurrency.currency);
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

  const isInterState = isInterStateSupply(buyerInfo.stateName);

  const { cgst, sgst, igst, totalTax } = isGstApplicable ? computeGstTax(subtotal, gstRate, isInterState) : NO_GST;

  const grandTotal = round(subtotal + totalTax);
  const currencyTotals = getCurrencyTotals(printCurrency, subtotal, subtotalOriginal, grandTotal);

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
    invoiceCurrency: printCurrency.currency,
    exchangeRateToINR: printCurrency.exchangeRateToINR,
    subtotalOriginal: currencyTotals.subtotalOriginal,
    grandTotalOriginal: currencyTotals.grandTotalOriginal,

    // Words — always derived from the Grand Total, never a qty calculation
    amountInWords: currencyTotals.amountInWords,
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
  const printCurrency = getPrintCurrency(project, invoiceNo);

  const cycles = getInvoiceCyclesForProject(project);
  const matchedCycle = cycles.find((c) => c.invoiceNo === invoiceNo);
  const cycleLabel = matchedCycle?.label || "Invoice";
  const invoiceStatus = getInvoiceCycleStatus(project, invoiceNo);

  const documentLines: InvoiceDocumentLineItem[] = [];
  let slNo = 1;
  let subtotal = 0;
  let subtotalOriginal = 0;
  let firstLineDate = "";

  items.forEach((item) => {
    (Array.isArray(item.invoices) ? item.invoices : []).forEach((line) => {
      if (line.invoiceNo !== invoiceNo || line.status === "Cancelled" || line.invoiceAmountINR <= 0) return;
      if (!firstLineDate && line.invoiceDate) firstLineDate = line.invoiceDate;

      const amount = round(line.invoiceAmountINR);
      const original = lineAmountInInvoiceCurrency(line, amount, printCurrency);
      subtotal = round(subtotal + amount);
      subtotalOriginal += original;

      documentLines.push({
        slNo: slNo++,
        activityName: item.description,
        amountINR: amount,
        amountOriginal: original,
      });
    });
  });

  const isGstApplicable = isGstApplicableForInvoice(project, printCurrency.currency);
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

  const isInterState = isInterStateSupply(buyerInfo.stateName);

  const { cgst, sgst, igst, totalTax } = isGstApplicable ? computeGstTax(subtotal, gstRate, isInterState) : NO_GST;

  const grandTotal = round(subtotal + totalTax);
  const currencyTotals = getCurrencyTotals(printCurrency, subtotal, subtotalOriginal, grandTotal);

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
    invoiceCurrency: printCurrency.currency,
    exchangeRateToINR: printCurrency.exchangeRateToINR,
    subtotalOriginal: currencyTotals.subtotalOriginal,
    grandTotalOriginal: currencyTotals.grandTotalOriginal,

    // Words — always derived from the Grand Total, never a qty calculation
    amountInWords: currencyTotals.amountInWords,
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
