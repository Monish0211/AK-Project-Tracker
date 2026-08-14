import { AppError } from "../../../shared/utils/AppError.js";
import { getProjectById } from "../../projects/services/project.service.js";
import type { ExpenseDto, ExpenseListDto } from "../dto/expense.dto.js";
import {
  createExpense as createExpenseInRepository,
  deleteExpense as deleteExpenseInRepository,
  getExpenseById,
  getExpensesByProjectId,
  updateExpense as updateExpenseInRepository,
} from "../repository/expense.repository.js";
import type { ProjectExpenseData } from "../expense.types.js";
import type { CreateExpenseInput, UpdateExpenseInput } from "../validators/expense.validators.js";

function toExpenseDto(row: Awaited<ReturnType<typeof getExpenseById>>): ExpenseDto {
  if (!row) {
    throw new AppError("Expense item not found.", 404);
  }

  return {
    id: row.id,
    projectId: row.projectId,
    category: row.category,
    description: row.description,
    quantity: row.quantity,
    unitCost: row.unitCost,
    totalCost: row.totalCost,
    remarks: row.remarks,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Throws AppError(404) via getProjectById() if the project doesn't exist or is soft-deleted. */
async function assertProjectExists(projectId: string): Promise<void> {
  await getProjectById(projectId);
}

export async function createExpenseForProject(projectId: string, input: CreateExpenseInput): Promise<ExpenseDto> {
  await assertProjectExists(projectId);

  const data: ProjectExpenseData = {
    category: input.category,
    description: input.description,
    quantity: input.quantity,
    unitCost: input.unitCost,
    totalCost: input.quantity * input.unitCost,
    remarks: input.remarks ?? null,
  };

  const created = await createExpenseInRepository(projectId, data);
  return toExpenseDto(created);
}

export async function listExpensesForProject(projectId: string): Promise<ExpenseListDto> {
  await assertProjectExists(projectId);

  const rows = await getExpensesByProjectId(projectId);
  return { items: rows.map((row) => toExpenseDto(row)) };
}

export async function updateExpenseItem(id: string, input: UpdateExpenseInput): Promise<ExpenseDto> {
  const existing = await getExpenseById(id);
  if (!existing) {
    throw new AppError("Expense item not found.", 404);
  }

  const quantity = input.quantity ?? existing.quantity;
  const unitCost = input.unitCost ?? existing.unitCost;

  const updated = await updateExpenseInRepository(id, {
    ...(input.category !== undefined && { category: input.category }),
    ...(input.description !== undefined && { description: input.description }),
    quantity,
    unitCost,
    totalCost: quantity * unitCost,
    ...(input.remarks !== undefined && { remarks: input.remarks }),
  });

  return toExpenseDto(updated);
}

export async function deleteExpenseItem(id: string): Promise<void> {
  const existing = await getExpenseById(id);
  if (!existing) {
    throw new AppError("Expense item not found.", 404);
  }

  await deleteExpenseInRepository(id);
}
