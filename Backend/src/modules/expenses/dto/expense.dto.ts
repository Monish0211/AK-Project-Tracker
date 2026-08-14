/**
 * Request/response shapes for the Other Project Expenses module — same
 * split as quantity.dto.ts: response DTOs (ExpenseDto/ExpenseListDto)
 * describe what the API returns; Create/Update DTOs describe what a request
 * body carries. Each ProjectExpense belongs to exactly one Project
 * (projectId).
 */
export interface CreateExpenseDto {
  category: string;
  description: string;

  quantity: number;
  unitCost: number;

  remarks?: string | null;
}

/** Same fields as CreateExpenseDto, all optional — a PATCH only carries what changed. */
export interface UpdateExpenseDto {
  category?: string;
  description?: string;

  quantity?: number;
  unitCost?: number;

  remarks?: string | null;
}

export interface ExpenseDto {
  id: string;
  projectId: string;

  category: string;
  description: string;

  quantity: number;
  unitCost: number;
  totalCost: number;

  remarks: string | null;

  createdAt: Date;
  updatedAt: Date;
}

/** GET /projects/:projectId/expenses response — every expense row belonging to that project. */
export interface ExpenseListDto {
  items: ExpenseDto[];
}
