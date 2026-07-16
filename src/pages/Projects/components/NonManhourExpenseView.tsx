import { Briefcase } from "lucide-react";

import type { NonManhourExpense } from "../../../types/NonManhourExpense";

import {
  formatIndianCurrency,
  formatIndianNumber,
} from "../../../utils/quantityCalculations";
import { Card, CardBody, CardHeader } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";

interface Props {
  expenses: NonManhourExpense[];
}

const NonManhourExpenseView = ({ expenses }: Props) => {
  return (
    <Card padded={false}>
      <CardHeader
        icon={<Briefcase size={16} />}
        iconTint="warning"
        title="Other Project Expenses"
        subtitle="Travel, accommodation and other project-related expenses"
      />

      {expenses.length === 0 ? (
        <CardBody>
          <EmptyState
            icon={<Briefcase size={22} />}
            title="No Other Expenses Recorded"
            description="No non man-hour expenses have been added for this project."
          />
        </CardBody>
      ) : (
        <div className="max-h-[26rem] overflow-auto nu-scrollbar">
          <table className="min-w-full text-[13px]">
            <thead className="sticky top-0 z-10 bg-[var(--nu-surface-alt)]">
              <tr className="text-[var(--nu-text-muted)] text-[11px] uppercase tracking-wide">
                <th className="px-4 py-2.5 text-left font-semibold">Category</th>
                <th className="px-4 py-2.5 text-left font-semibold">Description</th>
                <th className="px-4 py-2.5 text-center font-semibold">Quantity</th>
                <th className="px-4 py-2.5 text-right font-semibold">Unit Cost</th>
                <th className="px-4 py-2.5 text-right font-semibold">Total Cost</th>
                <th className="px-4 py-2.5 text-left font-semibold">Remarks</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[var(--nu-border)]">
              {expenses.map((expense) => (
                <tr key={expense.id} className="text-[var(--nu-text-secondary)] hover:bg-[var(--nu-surface-alt)]">
                  <td className="px-4 py-2.5 font-medium text-[var(--nu-text)]">{expense.category}</td>
                  <td className="px-4 py-2.5">{expense.description || "—"}</td>
                  <td className="px-4 py-2.5 text-center">{formatIndianNumber(expense.quantity)}</td>
                  <td className="px-4 py-2.5 text-right">{formatIndianCurrency(expense.unitCost)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-[var(--nu-warning)]">
                    {formatIndianCurrency(expense.totalCost)}
                  </td>
                  <td className="px-4 py-2.5 max-w-[12rem] truncate" title={expense.remarks}>
                    {expense.remarks || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

export default NonManhourExpenseView;
