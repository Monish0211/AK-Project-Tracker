/**
 * Invoice Payment workflow — response shapes. Every money value is an exact decimal STRING with the invoice currency's own
 * number of decimals ("125.50", "125.125"); the browser never receives a float for settlement. There is no GST anywhere here.
 */

export interface PaymentReceiptDto {
  id: string;
  /** Optional — null when the payment date was left blank. */
  paymentDate: string | null;
  /** The bank amount received, in the invoice currency. */
  amountReceived: string;
  currency: string;
  reference: string;
  notes: string | null;
}

export interface PaymentAdjustmentDto {
  id: string;
  category: string;
  amount: string;
  reason: string | null;
  /** Security Deposit / ISD only. */
  expectedReleaseDate: string | null;
  reminderDate: string | null;
  /** Foreign Exchange Loss only: the optional Applicable exchange rate entered (INR per unit), for INR reference figures. */
  exchangeRate: string | null;
}

export interface InvoicePaymentDto {
  id: string;
  projectId: string;
  invoiceNo: string;
  currency: string;
  status: "ACTIVE" | "REVERSED";
  receipts: PaymentReceiptDto[];
  adjustments: PaymentAdjustmentDto[];
  recordedByName: string;
  recordedAt: string;
  reversal: { at: string; byName: string; reason: string } | null;
  /** The invoice status this payment moved the invoice to (Partially Paid / Paid), or null when it changed nothing. */
  movedInvoiceTo: string | null;
}

export interface SettlementSummaryDto {
  currency: string;
  /** The invoice amount. */
  invoiceAmount: string;
  /** Actual bank amount received (all active payments), separate from deductions. */
  bankReceived: string;
  /** Total deductions (all categories count). */
  deductions: string;
  deductionsByCategory: Array<{ category: string; amount: string }>;
  /** Bank amount + deductions. */
  totalSettled: string;
  /** Invoice amount - total settled (never negative). */
  outstanding: string;
  /** NONE = nothing recorded, PARTIAL, SETTLED, INVALID (more than the invoice amount). */
  outcome: "NONE" | "PARTIAL" | "SETTLED" | "INVALID";
  /** The invoice status this settlement leads to: "Paid", "PartiallyPaid", or null (unchanged). */
  resultingStatus: "Paid" | "PartiallyPaid" | null;
  violations: Array<{ code: string; message: string }>;
}

/**
 * The invoice's GST as Record Payment shows it - an INVOICE component (never a deduction, never entered again here).
 *   SNAPSHOT = the invoice has a saved GST snapshot (taken when it was raised); the settlement target is taxable + GST.
 *   LEGACY   = raised before GST snapshots existed: GST details are not available and the settlement target stays the taxable amount.
 * A missing snapshot (LEGACY), an explicit NOT_APPLICABLE and an APPLICABLE snapshot at 0% are three different things.
 */
export interface InvoiceGstBreakdownDto {
  availability: "SNAPSHOT" | "LEGACY";
  /** null for a LEGACY invoice. */
  status: "APPLICABLE" | "NOT_APPLICABLE" | null;
  /** The selected rate ("18", "12.5", "0"), null when NOT_APPLICABLE or LEGACY. */
  ratePercent: string | null;
  taxType: "IGST" | "CGST_SGST" | null;
  buyerStateKnown: boolean | null;
  taxableAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  gstAmount: string;
  /** Taxable + GST: the settlement target. */
  totalAmount: string;
  /** True when the saved taxable amount no longer equals the invoice lines' total: payments are blocked until it is reconciled. */
  mismatch: boolean;
  /** "GST details not available (legacy invoice)" for a legacy invoice, otherwise null. */
  note: string | null;
}

export interface InvoicePaymentContextDto {
  projectId: string;
  invoiceNo: string;
  currency: string;
  /** The invoice's status as the portal shows it (cycle roll-up of its non-cancelled lines). */
  status: string;
  lineCount: number;
  /** The settlement target in the invoice currency: taxable + saved GST, or just the taxable amount for a legacy invoice. */
  invoiceAmount: string;
  /** The invoice's GST breakdown (see InvoiceGstBreakdownDto). */
  gst: InvoiceGstBreakdownDto;
  /** Whether THIS caller may record or reverse payments (Edit Invoice approval, not Read Only). */
  canRecord: boolean;
  /** Why a payment cannot be recorded right now (invoice state), or null. */
  recordBlockedReason: string | null;
  /** INR per ONE unit of the invoice currency, exactly as recorded on the invoice. "1" for INR. Display reference only — settlement never uses it. */
  exchangeRateToINR: string;
}

export interface InvoicePaymentOverviewDto {
  invoice: InvoicePaymentContextDto;
  /** ACTIVE payments only — the ones that count. A reversed payment is not part of the active entry workflow. */
  payments: InvoicePaymentDto[];
  /** Reversed payments, kept for audit and traceability (never deleted, never counted). Not shown in the payment-entry popup. */
  reversedPayments: InvoicePaymentDto[];
  /** Settlement of everything recorded and not reversed. */
  summary: SettlementSummaryDto;
}

export interface InvoicePaymentPreviewDto {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
  /** Settlement if this payment were saved on top of what is already recorded. Present when the input parsed. */
  summary: SettlementSummaryDto | null;
  /** What is already recorded (active payments only). */
  alreadyRecorded: SettlementSummaryDto | null;
  /** True when saving would persist the payment (no field errors and not over-settled). */
  canSave: boolean;
  /** The invoice's GST breakdown the settlement is measured against. */
  gst: InvoiceGstBreakdownDto;
}

export interface RecordPaymentResultDto {
  payment: InvoicePaymentDto;
  overview: InvoicePaymentOverviewDto;
  /** The status the invoice now has when this save changed it (Partially Paid / Paid), else null. */
  newInvoiceStatus: string | null;
  /** True when this was a repeat of an earlier identical Save attempt (nothing new was created). */
  replayed: boolean;
}

export interface ReversePaymentResultDto {
  overview: InvoicePaymentOverviewDto;
  /** The status the invoice now has when the reversal changed it, else null. */
  newInvoiceStatus: string | null;
}
