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

  /** Excel Import (Sept 2026) — null for a manually-entered row. Never settable via Create/Update — see CreateExpenseDto/UpdateExpenseDto, which deliberately omit it, so a PATCH can never detach or rewrite a row's source. */
  importBatchId: string | null;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * GET /projects/:projectId/expenses response — every expense row belonging
 * to that project.
 *
 * `count`/`latestUpdatedAt` (Sept 2026 concurrency-warning fix) are a cheap,
 * schema-free signal for the frontend: captured once when Edit Project
 * loads, re-fetched immediately before Save, and compared — a difference
 * means something changed this project's expenses in the meantime (another
 * tab, another user, or an Excel import). This is informational only; it is
 * NOT what prevents data loss (see otherProjectExpenseService.ts's
 * removedExpenseIds fix for the actual safety mechanism). Deliberately not
 * optimistic-locking/versioning — there is no conflict to reject, only a
 * fact worth surfacing, so a plain count+timestamp pair is enough and adds
 * no schema change.
 */
export interface ExpenseListDto {
  items: ExpenseDto[];
  count: number;
  latestUpdatedAt: Date | null;
}

/**
 * GET /projects/expenses response (Reports data consistency, Oct 2026) —
 * one page of active expense rows across every project the caller may read.
 * Each ExpenseDto already carries its projectId for grouping on the client.
 */
export interface ExpensePageDto {
  items: ExpenseDto[];
  total: number;
  page: number;
  pageSize: number;
}
