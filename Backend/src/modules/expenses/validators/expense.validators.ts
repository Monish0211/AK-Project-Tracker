import { z } from "zod";

/**
 * category/description/quantity/unitCost/remarks mirror
 * frontend/src/types/Project.ts's ManhourExpense-adjacent "Other Project
 * Expenses" row shape (NonManhourExpenseCard.tsx / NonManhourExpenseModal.tsx).
 * totalCost is deliberately NOT accepted here — expense.service.ts derives
 * it from quantity * unitCost (same convention as Quantity's own
 * unitRateINR/woValue derivation), so the backend is never trusted to store
 * a client-computed value that could drift from the server's own
 * calculation.
 *
 * category is free-text (min(1), not a hard enum) — matches Quantity's own
 * precedent for `uom`: the frontend has a fixed dropdown, but the backend
 * doesn't invent a stricter rule the UI doesn't already enforce.
 */
export const createExpenseSchema = z.object({
  category: z.string().trim().min(1, "Expense category is required."),
  description: z.string().trim().min(1, "Description is required."),

  quantity: z.coerce.number().positive("Quantity must be greater than 0."),
  unitCost: z.coerce.number().positive("Unit cost must be greater than 0."),

  remarks: z.string().trim().optional().nullable(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

/** Same fields as createExpenseSchema, all optional — a PATCH only carries what changed. */
export const updateExpenseSchema = z.object({
  category: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),

  quantity: z.coerce.number().positive("Quantity must be greater than 0.").optional(),
  unitCost: z.coerce.number().positive("Unit cost must be greater than 0.").optional(),

  remarks: z.string().trim().optional().nullable(),
});

export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

/**
 * Path-param validation for routes keyed by :projectId / :id — the shared
 * `validate()` middleware only covers req.body (same manual-safeParse
 * convention as quantity.validators.ts).
 */
export const projectIdParamSchema = z.object({
  projectId: z.string().trim().min(1, "Project ID is required."),
});

export type ProjectIdParam = z.infer<typeof projectIdParamSchema>;

export const expenseIdParamSchema = z.object({
  id: z.string().trim().min(1, "Expense ID is required."),
});

export type ExpenseIdParam = z.infer<typeof expenseIdParamSchema>;
