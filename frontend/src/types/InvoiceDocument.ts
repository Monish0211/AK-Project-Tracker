import type { InvoiceCurrency, InvoiceLineStatus, InvoiceMethod } from "./InvoiceItem";

export interface BuyerInformation {
  companyName: string;
  billingAddress: string;
  gstin: string;
  stateName: string;
  stateCode: string;
  placeOfSupply: string;
  contactPerson: string;
  contactNumber: string;
  email: string;
}

export interface InvoiceDocumentDetails {
  invoiceNoCustom?: string;
  referenceNoAndDate?: string;
  buyersOrderNo?: string;
  buyersOrderDate?: string;
  paymentTerms?: string;
  otherReferences?: string;
  referenceDate?: string;
  termsOfDelivery?: string;
  dispatchThrough?: string;
  deliveryNote?: string;
  transportDetails?: string;
  additionalNotes?: string;

  // Buyer (Bill To) Information stored per invoice cycle
  buyerInformation?: BuyerInformation;

  // Company Print Settings — footer details, editable per invoice cycle
  // (Company Print Settings section of the Invoice Document Configuration
  // popup). Pre-filled with the current company defaults the first time a
  // cycle's document is opened; each cycle then keeps its own independent
  // snapshot, exactly like buyerInformation above — editing one invoice's
  // footer never touches another invoice's already-saved values.
  companyPan?: string;
  bankName?: string;
  accountNo?: string;
  branch?: string;
  ifscCode?: string;
  companySignatureText?: string;
  authorisedSignatoryText?: string;
}

export interface InvoiceDocumentLineItem {
  slNo: number;
  activityName: string;
  descriptionNotes?: string;

  // Quantity Billing only — never populated for a Lump Sum document.
  hsnSac?: string;
  gstRatePercent?: number;
  basicUnitRateINR?: number;
  uom?: string;
  quantity?: number;

  // Lump Sum Billing only — never populated for a Quantity Billing document.
  milestonePercent?: number;

  // MLMP Billing only — "SET 1", "PACKAGE 3", etc — never populated for any other method.
  setLabel?: string;

  amountINR: number;
  /** This line's amount in the invoice's own currency (equals amountINR for an INR invoice). */
  amountOriginal: number;
  /** Quantity layout only: the unit rate in the invoice's own currency (equals basicUnitRateINR for INR). */
  basicUnitRateOriginal?: number;
}

export interface TaxSummaryRow {
  hsnSac: string;
  taxableValueINR: number;
  taxRatePercent: number;
  taxAmountINR: number;
  cgstAmountINR?: number;
  sgstAmountINR?: number;
  igstAmountINR?: number;
}

export interface InvoiceDocumentDTO {
  projectPRNo: string;
  invoiceCycleNo: string;
  cycleLabel: string;
  invoiceStatus: InvoiceLineStatus;
  isGstApplicable: boolean;
  /** Which independent mapper produced this DTO — decides the line-items column layout (Quantity vs Milestone %) in InvoiceDocumentView. Never mixed within one document. */
  billingMethod: InvoiceMethod;

  // Header Company Info
  companyName: string;
  companyAddress: string;
  companyGstin: string;
  companyState: string;
  companyStateCode: string;
  companyEmail: string;
  companyPan: string;

  // Reference Info
  invoiceNoCustom: string;
  invoiceDate: string;
  referenceNoAndDate: string;
  paymentTerms: string;
  buyersOrderNo: string;
  buyersOrderDate: string;
  otherReferences: string;
  referenceDate: string;
  termsOfDelivery: string;

  // Buyer Info
  buyerName: string;
  buyerAddress: string;
  buyerGstin: string;
  buyerState: string;
  buyerStateCode: string;
  buyerPlaceOfSupply: string;
  buyerContactPerson: string;
  buyerContactPhone: string;
  buyerContactEmail: string;

  // Line Items & Totals
  lineItems: InvoiceDocumentLineItem[];
  subtotalINR: number;
  taxRatePercent: number;
  isInterState: boolean;
  cgstAmountINR: number;
  sgstAmountINR: number;
  igstAmountINR: number;
  totalTaxINR: number;
  grandTotalINR: number;

  /**
   * Invoice Currency (Oct 2026) — the currency the invoice is PRINTED in:
   * its own saved currency. For INR every *Original figure equals its *INR
   * twin and exchangeRateToINR is 1, so an INR document is unchanged. For a
   * foreign currency the *Original figures are the primary invoice amounts;
   * subtotalINR/grandTotalINR remain the recorded INR equivalent, shown only
   * as a reference (foreign invoices never carry GST).
   */
  invoiceCurrency: InvoiceCurrency;
  exchangeRateToINR: number;
  subtotalOriginal: number;
  grandTotalOriginal: number;

  // Words — amountInWords is in the invoice's own currency
  amountInWords: string;
  taxAmountInWords: string;

  // Bank Info
  bankName: string;
  accountNo: string;
  branchAndIfsc: string;

  // Signature Block
  companySignatureText: string;
  authorisedSignatoryText: string;
}
