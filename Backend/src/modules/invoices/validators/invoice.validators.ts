import { z } from "zod";

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
 * unitPriceINR/calculatedAmountINR/commercialAdjustmentINR are deliberately
 * NOT accepted here — invoice.service.ts derives them from the parent
 * QuantityItem's CURRENT unitRateINR and (if milestoneId is given) the
 * referenced PaymentMilestone's paymentPercentage, so the backend is never
 * trusted to store a client-computed value that could drift from Quantity/
 * Milestones. quantityItemId is not part of the body — it comes from the
 * route param (POST /quantity/:quantityItemId/invoice-lines), matching how
 * projectId is a route param, not a body field, on every other module.
 */
export const createInvoiceLineSchema = z.object({
  invoiceNo: z.string().trim().min(1, "Invoice No is required."),
  invoiceDate: z.coerce.date(),

  milestoneId: z.string().trim().min(1).optional().nullable(),
  milestoneName: z.string().trim().min(1).optional().nullable(),
  setIndex: z.coerce.number().int().positive().optional().nullable(),

  description: z.string().trim().optional().nullable(),

  quantityBilled: z.coerce.number().min(0, "Quantity Billed cannot be negative."),
  invoiceAmountINR: z.coerce.number().min(0, "Invoice Amount cannot be negative."),

  clientReference: z.string().trim().optional().nullable(),
  remarks: z.string().trim().optional().nullable(),

  status: z.enum(CREATE_INVOICE_LINE_STATUSES).default("Raised"),
  createdBy: z.string().trim().min(1, "Created By is required."),
});

export type CreateInvoiceLineInput = z.infer<typeof createInvoiceLineSchema>;

/**
 * Same fields as createInvoiceLineSchema, all optional — a PATCH only
 * carries what changed. `status` accepts the full 5-value set here (this is
 * the only path PartiallyPaid/Paid are ever reached from). `createdBy` is
 * not editable (identity, frozen at creation).
 */
export const updateInvoiceLineSchema = z.object({
  invoiceNo: z.string().trim().min(1).optional(),
  invoiceDate: z.coerce.date().optional(),

  milestoneId: z.string().trim().min(1).optional().nullable(),
  milestoneName: z.string().trim().min(1).optional().nullable(),
  setIndex: z.coerce.number().int().positive().optional().nullable(),

  description: z.string().trim().optional().nullable(),

  quantityBilled: z.coerce.number().min(0, "Quantity Billed cannot be negative.").optional(),
  invoiceAmountINR: z.coerce.number().min(0, "Invoice Amount cannot be negative.").optional(),

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
export const projectIdParamSchema = z.object({
  projectId: z.string().trim().min(1, "Project ID is required."),
});

export type ProjectIdParam = z.infer<typeof projectIdParamSchema>;

export const quantityItemIdParamSchema = z.object({
  quantityItemId: z.string().trim().min(1, "Quantity Item ID is required."),
});

export type QuantityItemIdParam = z.infer<typeof quantityItemIdParamSchema>;

export const invoiceLineIdParamSchema = z.object({
  id: z.string().trim().min(1, "Invoice Line ID is required."),
});

export type InvoiceLineIdParam = z.infer<typeof invoiceLineIdParamSchema>;
