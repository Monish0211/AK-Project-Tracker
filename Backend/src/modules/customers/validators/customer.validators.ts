import { z } from "zod";

/** Empty string → null so optional email fields from the UI validate cleanly. */
const optionalEmail = z
  .union([z.string().trim().email("Please enter a valid email address."), z.literal(""), z.null()])
  .optional()
  .transform((value) => (value === undefined || value === "" ? null : value));

const optionalText = z
  .union([z.string().trim(), z.literal(""), z.null()])
  .optional()
  .transform((value) => (value === undefined || value === "" ? null : value));

/**
 * Mirrors CustomerModal.tsx / customerService.ts: customerName required;
 * email format checked when provided; status Active|Inactive; all other
 * profile fields optional.
 */
export const createCustomerSchema = z.object({
  customerCode: optionalText,
  customerName: z.string().trim().min(1, "Customer Name is required."),
  companyName: optionalText,
  country: optionalText,
  contactPerson: optionalText,
  email: optionalEmail,
  phone: optionalText,
  status: z.enum(["Active", "Inactive"]).default("Active"),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

/** Same fields as create, all optional — a PATCH only carries what changed. */
export const updateCustomerSchema = z.object({
  customerCode: optionalText,
  customerName: z.string().trim().min(1, "Customer Name is required.").optional(),
  companyName: optionalText,
  country: optionalText,
  contactPerson: optionalText,
  email: optionalEmail,
  phone: optionalText,
  status: z.enum(["Active", "Inactive"]).optional(),
});

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

/**
 * GET /customers query — supports the Customer Master page's search / status
 * / sort needs. Pagination follows the Employees list convention.
 */
export const listCustomersQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(1000).default(500),
  sortField: z.enum(["customerName", "status", "createdAt", "companyName"]).default("createdAt"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});

export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;

/**
 * POST /customers/import — Excel/CSV is parsed client-side (same as
 * Employees/Projects). Body is JSON. All-or-nothing: the service rejects the
 * entire batch if any row fails validation or would duplicate a name.
 */
export const importCustomerRowSchema = z.object({
  customerCode: optionalText,
  customerName: z.string().trim().min(1, "Customer Name is required."),
  companyName: optionalText,
  country: optionalText,
  contactPerson: optionalText,
  email: optionalEmail,
  phone: optionalText,
  status: z.enum(["Active", "Inactive"]).default("Active"),
});

export type ImportCustomerRowInput = z.infer<typeof importCustomerRowSchema>;

export const importCustomersSchema = z.object({
  customers: z.array(importCustomerRowSchema).min(1, "At least one customer row is required."),
});

export type ImportCustomersInput = z.infer<typeof importCustomersSchema>;

export const customerIdParamSchema = z.object({
  id: z.string().trim().min(1, "Customer ID is required."),
});

export type CustomerIdParam = z.infer<typeof customerIdParamSchema>;
