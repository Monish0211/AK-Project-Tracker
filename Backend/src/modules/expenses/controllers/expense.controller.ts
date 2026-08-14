import type { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/asyncHandler.js";
import { AppError } from "../../../shared/utils/AppError.js";
import * as expenseService from "../services/expense.service.js";
import { projectIdParamSchema, expenseIdParamSchema } from "../validators/expense.validators.js";
import type { CreateExpenseInput, UpdateExpenseInput } from "../validators/expense.validators.js";

// Path params aren't covered by the shared `validate()` middleware (body
// only) — same manual-safeParse convention as quantity.controller.ts.
function parseProjectIdParam(req: Request): string {
  const result = projectIdParamSchema.safeParse(req.params);
  if (!result.success) {
    throw new AppError("Project ID is required.", 400);
  }
  return result.data.projectId;
}

function parseExpenseIdParam(req: Request): string {
  const result = expenseIdParamSchema.safeParse(req.params);
  if (!result.success) {
    throw new AppError("Expense ID is required.", 400);
  }
  return result.data.id;
}

export const createExpense = asyncHandler(async (req: Request, res: Response) => {
  const projectId = parseProjectIdParam(req);
  const expense = await expenseService.createExpenseForProject(projectId, req.body as CreateExpenseInput);
  res.status(201).json({ success: true, data: expense, message: "Expense item created successfully." });
});

export const getExpensesByProject = asyncHandler(async (req: Request, res: Response) => {
  const projectId = parseProjectIdParam(req);
  const result = await expenseService.listExpensesForProject(projectId);
  res.status(200).json({ success: true, data: result });
});

export const updateExpense = asyncHandler(async (req: Request, res: Response) => {
  const id = parseExpenseIdParam(req);
  const expense = await expenseService.updateExpenseItem(id, req.body as UpdateExpenseInput);
  res.status(200).json({ success: true, data: expense, message: "Expense item updated successfully." });
});

export const deleteExpense = asyncHandler(async (req: Request, res: Response) => {
  const id = parseExpenseIdParam(req);
  await expenseService.deleteExpenseItem(id);
  res.status(200).json({ success: true, data: null, message: "Expense item deleted successfully." });
});
