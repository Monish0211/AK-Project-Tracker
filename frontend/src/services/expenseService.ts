import type { ManhourExpense } from "../types/ManhourExpense";
import type { NonManhourExpense } from "../types/NonManhourExpense";

export function calculateManhourCost(
  expense: ManhourExpense
): ManhourExpense {
  return {
    ...expense,
    totalCost: expense.bookedHours * expense.manhourRate,
  };
}

export function calculateNonManhourCost(
  expense: NonManhourExpense
): NonManhourExpense {
  return {
    ...expense,
    totalCost: expense.quantity * expense.unitCost,
  };
}

export function getTotalManhourCost(
  expenses: ManhourExpense[]
): number {
  if (!Array.isArray(expenses)) {
    return 0;
  }

  return expenses.reduce(
    (total, expense) => total + expense.totalCost,
    0
  );
}

export function getTotalNonManhourCost(
  expenses: NonManhourExpense[]
): number {
  if (!Array.isArray(expenses)) {
    return 0;
  }

  return expenses.reduce((total, expense) => {
    const rowTotal =
      typeof expense.totalCost === "number" && !isNaN(expense.totalCost)
        ? expense.totalCost
        : (expense.quantity || 0) * (expense.unitCost || 0);
    return total + rowTotal;
  }, 0);
}

export function getTotalProjectCost(
  manhourExpenses: ManhourExpense[],
  nonManhourExpenses: NonManhourExpense[]
): number {
  return (
    getTotalManhourCost(manhourExpenses) +
    getTotalNonManhourCost(nonManhourExpenses)
  );
}

export function getGrossProfit(
  revenue: number,
  totalCost: number
): number {
  return revenue - totalCost;
}

export function getProfitMargin(
  revenue: number,
  grossProfit: number
): number {
  if (revenue === 0) {
    return 0;
  }

  return (grossProfit / revenue) * 100;
}