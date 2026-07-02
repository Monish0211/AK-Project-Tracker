import type { Project } from "../types/Project";

export interface ExpenseResult {
  totalExpenses: number;
  profit: number;
  profitPercentage: number;
}

export function calculateExpenses(
  project: Project,
  manhourExpenses: number,
  nonManhourExpenses: number
): ExpenseResult {
  const totalExpenses =
    manhourExpenses + nonManhourExpenses;

  const profit =
    project.paymentReceivedINR - totalExpenses;

  const profitPercentage =
    project.paymentReceivedINR === 0
      ? 0
      : (profit / project.paymentReceivedINR) * 100;

  return {
    totalExpenses,
    profit,
    profitPercentage,
  };
}