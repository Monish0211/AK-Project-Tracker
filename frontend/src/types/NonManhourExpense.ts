export interface NonManhourExpense {
  id: string;

  category: string;

  description: string;

  quantity: number;

  unitCost: number;

  totalCost: number;

  remarks: string;

  /** Excel Import (Sept 2026) — null/undefined for a manually-entered row. Present (a real batch id) only for a row an Excel import created; preserved across manual edits (editing an imported row's category/amount does NOT detach it from its batch — see NonManhourExpenseModal.tsx/otherProjectExpenseService.ts). */
  importBatchId?: string | null;
}