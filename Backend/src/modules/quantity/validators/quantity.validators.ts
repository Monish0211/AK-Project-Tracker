import { z } from "zod";

/**
 * uom/assignedTo/currency mirror frontend/src/types/QuantityItem.ts exactly.
 * pendingQty/unitRateINR/woValue/pendingAmount are deliberately NOT accepted
 * here — quantity.service.ts derives them from woQty/invoiceQty/unitRate/
 * exchangeRate/currency/uom (same formula as recalcQuantityItem() in
 * frontend/src/utils/quantityCalculations.ts), so the backend is never
 * trusted to store a client-computed value that could drift from the
 * server's own calculation.
 */
export const createQuantitySchema = z.object({
  description: z.string().trim().min(1, "Description is required."),

  woQty: z.coerce.number().min(0, "WO Qty cannot be negative."),
  invoiceQty: z.coerce.number().min(0, "Invoice Qty cannot be negative.").default(0),

  uom: z.string().trim().min(1, "UOM is required."),
  assignedTo: z.string().trim().min(1).optional().nullable(),

  currency: z.string().trim().min(1, "Currency is required.").default("INR"),

  unitRate: z.coerce.number().min(0, "Unit Rate cannot be negative."),
  exchangeRate: z.coerce.number().positive("Exchange Rate must be greater than 0.").default(1),
});

export type CreateQuantityInput = z.infer<typeof createQuantitySchema>;

/** Same fields as createQuantitySchema, all optional — a PATCH only carries what changed. */
export const updateQuantitySchema = z.object({
  description: z.string().trim().min(1).optional(),

  woQty: z.coerce.number().min(0, "WO Qty cannot be negative.").optional(),
  invoiceQty: z.coerce.number().min(0, "Invoice Qty cannot be negative.").optional(),

  uom: z.string().trim().min(1).optional(),
  assignedTo: z.string().trim().min(1).optional().nullable(),

  currency: z.string().trim().min(1).optional(),

  unitRate: z.coerce.number().min(0, "Unit Rate cannot be negative.").optional(),
  exchangeRate: z.coerce.number().positive("Exchange Rate must be greater than 0.").optional(),
});

export type UpdateQuantityInput = z.infer<typeof updateQuantitySchema>;

/**
 * Path-param validation for routes keyed by :projectId / :id — the shared
 * `validate()` middleware only covers req.body (see project.controller.ts's
 * getProjects for the same manual-safeParse convention used for params/
 * query that aren't part of the body).
 */
export const projectIdParamSchema = z.object({
  projectId: z.string().trim().min(1, "Project ID is required."),
});

export type ProjectIdParam = z.infer<typeof projectIdParamSchema>;

export const quantityIdParamSchema = z.object({
  id: z.string().trim().min(1, "Quantity ID is required."),
});

export type QuantityIdParam = z.infer<typeof quantityIdParamSchema>;
