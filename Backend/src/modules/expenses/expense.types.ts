/**
 * Shared shapes reused across the Other Project Expenses module's layers
 * (repository, service, controller) — mirrors quantity.types.ts's
 * QuantityItemData. Each ProjectExpense belongs to exactly one Project (see
 * schema.prisma's Project.projectExpenses / ProjectExpense.projectId
 * relation). This is a completely separate module from Expense Budget (the
 * 5 flat fields on Project) — see project.repository.ts's
 * ProjectGeneralInfoData for that one.
 */
export interface ProjectExpenseData {
  category: string;
  description: string;

  quantity: number;
  unitCost: number;
  totalCost: number;

  remarks?: string | null;
}
