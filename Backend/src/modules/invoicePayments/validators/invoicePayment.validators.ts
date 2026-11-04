import { z } from "zod";

/**
 * Invoice Payment workflow (Nov 2026) — request SHAPE only. Every amount, date and rule is validated by
 * paymentInput.rules.ts (currency-aware, exact), so the two layers can never disagree about what a valid amount is.
 * Amounts travel as strings so no float ever represents a settlement value.
 */
const submissionShape = {
  projectId: z.string().trim().min(1, "Project is required."),
  invoiceNo: z.string().trim().min(1, "Invoice number is required."),
  currency: z.string().trim().optional(),
  receipts: z.unknown().optional(),
  adjustments: z.unknown().optional(),
};

export const savePaymentSchema = z.object({ ...submissionShape, idempotencyKey: z.string().trim().min(1, "idempotencyKey is required.") });
export const previewPaymentSchema = z.object(submissionShape);
export const reversePaymentSchema = z.object({ reason: z.string().trim().min(3, "A reason is required to reverse a payment.").max(500, "The reversal reason can be at most 500 characters.") });

export const paymentQuerySchema = z.object({
  projectId: z.string().trim().min(1, "projectId is required."),
  invoiceNo: z.string().trim().min(1, "invoiceNo is required."),
});

export const paymentIdParamSchema = z.object({ id: z.string().trim().min(1, "Payment ID is required.") });

export type SavePaymentInput = z.infer<typeof savePaymentSchema>;
export type PreviewPaymentInput = z.infer<typeof previewPaymentSchema>;
