import { apiClient } from "./apiClient";

/**
 * Invoice Payment workflow — the browser side of the backend's /invoice-payments API. The backend is the authority for every
 * settlement figure and for the invoice's status (Partially Paid / Paid); this file only carries typed values to it and the
 * results back. Money travels as exact decimal STRINGS in the invoice's own currency (never a float, never INR converted), and
 * every figure it returns is a string with the currency's own number of decimals. There is no GST anywhere in this workflow.
 *
 * These types mirror Backend/src/modules/invoicePayments/dto/invoicePayment.dto.ts.
 */

export interface PaymentReceiptDto {
  id: string;
  /** Optional - null when it was left blank. */
  paymentDate: string | null;
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
  expectedReleaseDate: string | null;
  reminderDate: string | null;
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
  movedInvoiceTo: string | null;
}

export interface SettlementSummaryDto {
  currency: string;
  invoiceAmount: string;
  bankReceived: string;
  deductions: string;
  deductionsByCategory: Array<{ category: string; amount: string }>;
  totalSettled: string;
  outstanding: string;
  outcome: "NONE" | "PARTIAL" | "SETTLED" | "INVALID";
  resultingStatus: "Paid" | "PartiallyPaid" | null;
  violations: Array<{ code: string; message: string }>;
}

export interface InvoicePaymentContextDto {
  projectId: string;
  invoiceNo: string;
  currency: string;
  status: string;
  lineCount: number;
  invoiceAmount: string;
  canRecord: boolean;
  recordBlockedReason: string | null;
  /** INR per ONE unit of the invoice currency, as recorded on the invoice. Used only for INR reference figures — never for settlement. */
  exchangeRateToINR: string;
}

export interface InvoicePaymentOverviewDto {
  invoice: InvoicePaymentContextDto;
  /** ACTIVE payments only. */
  payments: InvoicePaymentDto[];
  /** Reversed payments, kept for audit; the popup does not show them. */
  reversedPayments: InvoicePaymentDto[];
  summary: SettlementSummaryDto;
}

export interface FieldErrorDto {
  path: string;
  message: string;
}

export interface InvoicePaymentPreviewDto {
  valid: boolean;
  errors: FieldErrorDto[];
  summary: SettlementSummaryDto | null;
  alreadyRecorded: SettlementSummaryDto | null;
  canSave: boolean;
}

export interface RecordPaymentResultDto {
  payment: InvoicePaymentDto;
  overview: InvoicePaymentOverviewDto;
  newInvoiceStatus: string | null;
  replayed: boolean;
}

export interface ReversePaymentResultDto {
  overview: InvoicePaymentOverviewDto;
  newInvoiceStatus: string | null;
}

/** What the popup sends. Every amount is a string in the invoice currency, exactly as typed (trimmed); the backend validates it again. */
export interface PaymentSubmissionPayload {
  projectId: string;
  invoiceNo: string;
  currency: string;
  receipts: Array<{ paymentDate?: string; amountReceived: string; reference?: string; notes?: string }>;
  adjustments: Array<{
    category: string;
    amount: string;
    expectedReleaseDate?: string;
    reminderDate?: string;
    exchangeRate?: string;
  }>;
}

export const getInvoicePaymentOverview = (projectId: string, invoiceNo: string): Promise<InvoicePaymentOverviewDto> =>
  apiClient.get<InvoicePaymentOverviewDto>(`/invoice-payments?projectId=${encodeURIComponent(projectId)}&invoiceNo=${encodeURIComponent(invoiceNo)}`);

export const previewInvoicePayment = (payload: PaymentSubmissionPayload): Promise<InvoicePaymentPreviewDto> =>
  apiClient.post<InvoicePaymentPreviewDto>("/invoice-payments/preview", payload);

export const recordInvoicePayment = (payload: PaymentSubmissionPayload, idempotencyKey: string): Promise<RecordPaymentResultDto> =>
  apiClient.post<RecordPaymentResultDto>("/invoice-payments", { ...payload, idempotencyKey });

export const reverseInvoicePayment = (paymentId: string, reason: string): Promise<ReversePaymentResultDto> =>
  apiClient.post<ReversePaymentResultDto>(`/invoice-payments/${encodeURIComponent(paymentId)}/reverse`, { reason });
