import { z } from "zod";
import { uuidParamSchema } from "../../../shared/utils/uuidParam.js";
import { INVOICE_CURRENCIES } from "../invoiceCurrency.rules.js";

/**
 * The 5 statuses a line can carry — mirrors
 * frontend/src/pages/Projects/components/Invoice/InvoiceCalculations.ts's
 * InvoiceLineStatus exactly.
 */
const INVOICE_LINE_STATUSES = ["Draft", "Raised", "PartiallyPaid", "Paid", "Cancelled"] as const;

/**
 * Only the 3 values the "Raise Invoice" UI action itself ever sets — matches
 * RAISE_INVOICE_STATUS_OPTIONS in InvoiceCalculations.ts.
 * PartiallyPaid/Paid are only ever reached via PATCH (see
 * updateInvoiceLineSchema below), matching how Invoice History's status
 * dropdown is the only place those values are set today.
 */
const CREATE_INVOICE_LINE_STATUSES = ["Draft", "Raised", "Cancelled"] as const;

/**
 * Same accepted format as the frontend's validateExchangeRate(): a JSON
 * number, or a plain decimal string ("83", "83.25", ".5"). z.coerce.number()
 * would quietly turn "1e3" into 1000, "0x10" into 16 and `true` into 1.
 * No range — any finite rate > 0 (confirmed Oct 2026).
 */
const EXCHANGE_RATE_STRING = /^(\d+(\.\d*)?|\.\d+)$/;
const exchangeRateSchema = z
  .union([z.number(), z.string().trim().regex(EXCHANGE_RATE_STRING, "Exchange rate must be a number greater than 0.").transform(Number)])
  .pipe(z.number().finite().positive("Exchange rate must be greater than 0."));

/** Invoice Currency feature (Oct 2026) — shared by the create and update schemas below. */
const invoiceCurrencyFields = {
  currency: z.enum(INVOICE_CURRENCIES).optional(),
  exchangeRateToINR: exchangeRateSchema.optional(),
  invoiceAmountOriginal: z.coerce.number().min(0, "Invoice Amount cannot be negative.").optional(),
};

/**
 * unitPriceINR/calculatedAmountINR/commercialAdjustmentINR are deliberately
 * NOT accepted here — invoice.service.ts derives them from the parent
 * QuantityItem's CURRENT unitRateINR and (if milestoneId is given) the
 * referenced PaymentMilestone's paymentPercentage, so the backend is never
 * trusted to store a client-computed value that could drift from Quantity/
 * Milestones. quantityItemId is not part of the body — it comes from the
 * route param (POST /quantity/:quantityItemId/invoice-lines), matching how
 * projectId is a route param, not a body field, on every other module.
 * createdBy is likewise NOT accepted here — it is always derived server-side
 * from the authenticated caller (see invoice.service.ts's
 * createInvoiceLineForQuantityItem()), never trusted from the request body.
 */
export const createInvoiceLineSchema = z.object({
  // Manual invoice numbering (Oct 2026) — the user's own Tally number,
  // trimmed of outer whitespace only; never generated server-side. No
  // maximum length (it must match Tally exactly) — see invoice.service.ts's
  // insertInvoiceNumberOrReject() for the database's own physical ceiling.
  invoiceNo: z.string().trim().min(1, "Invoice Number is required."),
  // "new" = this line starts a new invoice (number must be unused
  // portal-wide); "existing" = joins this project's invoice. Optional for
  // callers that predate manual numbering — see invoice.service.ts's
  // registerInvoiceNumberForLine().
  invoiceIntent: z.enum(["new", "existing"]).optional(),
  invoiceDate: z.coerce.date(),

  milestoneId: z.string().trim().min(1).optional().nullable(),
  milestoneName: z.string().trim().min(1).optional().nullable(),
  setIndex: z.coerce.number().int().positive().optional().nullable(),

  description: z.string().trim().optional().nullable(),

  quantityBilled: z.coerce.number().min(0, "Quantity Billed cannot be negative."),
  // Optional only for a non-INR line, where the server derives it from
  // invoiceAmountOriginal x exchangeRateToINR (see invoiceCurrency.rules.ts's
  // resolveCreateAmounts(), which also rejects an INR line without it).
  // Every existing caller always sends it, exactly as before.
  invoiceAmountINR: z.coerce.number().min(0, "Invoice Amount cannot be negative.").optional(),

  // Invoice Currency feature (Oct 2026) — all three optional, so every
  // existing caller (which sends none of them) is treated as INR exactly as
  // before. Cross-field rules (non-INR requires a positive rate and an original
  // amount; INR requires rate 1 and original === INR amount) live in
  // invoiceCurrency.rules.ts. z.number() rejects NaN and +/-Infinity.
  ...invoiceCurrencyFields,

  clientReference: z.string().trim().optional().nullable(),
  remarks: z.string().trim().optional().nullable(),

  status: z.enum(CREATE_INVOICE_LINE_STATUSES).default("Raised"),
});

export type CreateInvoiceLineInput = z.infer<typeof createInvoiceLineSchema>;

/**
 * Same fields as createInvoiceLineSchema, all optional — a PATCH only
 * carries what changed. `status` accepts the full 5-value set here (this is
 * the only path PartiallyPaid/Paid are ever reached from). `createdBy` is
 * not editable (identity, frozen at creation).
 */
export const updateInvoiceLineSchema = z.object({
  invoiceNo: z.string().trim().min(1, "Invoice Number cannot be blank.").optional(),
  invoiceDate: z.coerce.date().optional(),

  milestoneId: z.string().trim().min(1).optional().nullable(),
  milestoneName: z.string().trim().min(1).optional().nullable(),
  setIndex: z.coerce.number().int().positive().optional().nullable(),

  description: z.string().trim().optional().nullable(),

  quantityBilled: z.coerce.number().min(0, "Quantity Billed cannot be negative.").optional(),
  invoiceAmountINR: z.coerce.number().min(0, "Invoice Amount cannot be negative.").optional(),

  // Invoice Currency feature (Oct 2026) — accepted here only so a change
  // attempt is REJECTED explicitly (invoiceCurrency.rules.ts's
  // resolveUpdateAmounts()) rather than silently stripped. Re-sending the
  // line's existing currency/rate unchanged is always fine; for a non-INR line,
  // invoiceAmountOriginal is how its amount is edited.
  ...invoiceCurrencyFields,

  clientReference: z.string().trim().optional().nullable(),
  remarks: z.string().trim().optional().nullable(),

  status: z.enum(INVOICE_LINE_STATUSES).optional(),
});

export type UpdateInvoiceLineInput = z.infer<typeof updateInvoiceLineSchema>;

/**
 * POST /projects/:projectId/invoice-items/ingest — the ONLY path that
 * accepts a client-supplied `id`, and the ONLY path that accepts
 * unitPriceINR/calculatedAmountINR/commercialAdjustmentINR directly, because
 * these rows already exist (legacy localStorage projects being opened in
 * Edit for the first time after this migration) with historical snapshot
 * values that must be preserved verbatim, not recomputed from a
 * QuantityItem's CURRENT rate. Shape validation only — invoice.service.ts's
 * ingestInvoiceLinesForProject() is where an id that already exists gets
 * classified as an identical-retry no-op vs. a rejected conflict, and where
 * a quantityItemId that doesn't belong to this project (or doesn't exist at
 * all — meaning Quantity was never migrated for this project) is rejected.
 * Same per-field rules as createInvoiceLineSchema/updateInvoiceLineSchema,
 * matching ingestMilestonesSchema's precedent of reusing its ordinary
 * create schema's rules per row.
 */
export const ingestInvoiceLinesSchema = z.object({
  lines: z
    .array(
      z.object({
        id: z.string().trim().uuid("Invoice Line ID must be a valid UUID."),
        quantityItemId: z.string().trim().min(1, "Quantity Item ID is required."),

        invoiceNo: z.string().trim().min(1, "Invoice No is required."),
        invoiceDate: z.coerce.date(),

        milestoneId: z.string().trim().min(1).optional().nullable(),
        milestoneName: z.string().trim().min(1).optional().nullable(),
        setIndex: z.coerce.number().int().positive().optional().nullable(),

        description: z.string().trim().optional().nullable(),

        quantityBilled: z.coerce.number().min(0, "Quantity Billed cannot be negative."),

        unitPriceINR: z.coerce.number().optional().nullable(),
        calculatedAmountINR: z.coerce.number().optional().nullable(),
        invoiceAmountINR: z.coerce.number().min(0, "Invoice Amount cannot be negative."),
        commercialAdjustmentINR: z.coerce.number().optional().nullable(),

        clientReference: z.string().trim().optional().nullable(),
        remarks: z.string().trim().optional().nullable(),

        status: z.enum(INVOICE_LINE_STATUSES),
        createdBy: z.string().trim().min(1, "Created By is required."),
      })
    )
    .min(1, "At least one invoice line is required."),
});

export type IngestInvoiceLinesInput = z.infer<typeof ingestInvoiceLinesSchema>;

/**
 * Path-param validation for routes keyed by :projectId / :quantityItemId /
 * :id — the shared `validate()` middleware only covers req.body (same
 * manual-safeParse convention as quantity.validators.ts/milestone.
 * validators.ts's param schemas).
 */
// P2-07 — Project.id/QuantityItem.id/InvoiceLine.id are real UUID surrogate
// keys.
export const projectIdParamSchema = uuidParamSchema("projectId", "Project ID");

export type ProjectIdParam = z.infer<typeof projectIdParamSchema>;

export const quantityItemIdParamSchema = uuidParamSchema("quantityItemId", "Quantity Item ID");

export type QuantityItemIdParam = z.infer<typeof quantityItemIdParamSchema>;

export const invoiceLineIdParamSchema = uuidParamSchema("id", "Invoice Line ID");

export type InvoiceLineIdParam = z.infer<typeof invoiceLineIdParamSchema>;

/**
 * Request Invoice workflow (Sept 2026) — Section C: "Send Invoice To." A
 * separate, manual, post-raise action — recipients are plain active-user
 * ids (re-validated server-side against isActive, never trusted as-is; see
 * invoice.service.ts's sendInvoiceLineToUsers()), deliberately NOT restricted
 * to users holding "Raise Invoice" — any active user may be a recipient.
 */
export const sendInvoiceLineToSchema = z.object({
  userIds: z.array(z.string().trim().min(1)).min(1, "Select at least one recipient."),
});
export type SendInvoiceLineToInput = z.infer<typeof sendInvoiceLineToSchema>;
