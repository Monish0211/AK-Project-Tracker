import { AppError } from "../../../shared/utils/AppError.js";
import { assertProjectAccessById } from "../../../shared/utils/projectAccess.js";
import type { AccessTokenPayload } from "../../../shared/types/auth.types.js";
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

/** Throws AppError(404) if the project doesn't exist, or 403 if the caller isn't authorized for it — see shared/utils/projectAccess.ts. */
async function assertProjectExists(projectId: string, user: AccessTokenPayload): Promise<void> {
  await assertProjectAccessById(projectId, user);
}

export async function createExpenseForProject(
  projectId: string,
  input: CreateExpenseInput,
  user: AccessTokenPayload
): Promise<ExpenseDto> {
  await assertProjectExists(projectId, user);

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

export async function listExpensesForProject(projectId: string, user: AccessTokenPayload): Promise<ExpenseListDto> {
  await assertProjectExists(projectId, user);

  const rows = await getExpensesByProjectId(projectId);
  return { items: rows.map((row) => toExpenseDto(row)) };
}

export async function updateExpenseItem(
  id: string,
  input: UpdateExpenseInput,
  user: AccessTokenPayload
): Promise<ExpenseDto> {
  const existing = await getExpenseById(id);
  if (!existing) {
    throw new AppError("Expense item not found.", 404);
  }
  await assertProjectAccessById(existing.projectId, user);

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

export async function deleteExpenseItem(id: string, user: AccessTokenPayload): Promise<void> {
  const existing = await getExpenseById(id);
  if (!existing) {
    throw new AppError("Expense item not found.", 404);
  }
  await assertProjectAccessById(existing.projectId, user);

  await deleteExpenseInRepository(id);
}
