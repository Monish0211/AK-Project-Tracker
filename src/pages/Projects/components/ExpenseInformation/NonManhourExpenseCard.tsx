import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Briefcase, Plus } from "lucide-react";

import type { Project } from "../../../../types/Project";
import type { NonManhourExpense } from "../../../../types/NonManhourExpense";

import {
  calculateNonManhourCost,
} from "../../../../services/expenseService";
import { formatBusinessINR, formatFullINR } from "../../../../utils/formatCurrency";

import NonManhourExpenseModal from "./NonManhourExpenseModal";
import NonManhourExpenseTable from "./NonManhourExpenseTable";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
}

const NonManhourExpenseCard = ({ project, setProject }: Props) => {
  const expenses = project.nonManhourExpenses;

  const [showModal, setShowModal] = useState(false);

  const [editingExpense, setEditingExpense] =
    useState<NonManhourExpense | null>(null);

  // Total Other Expenses = Non Man-Hour Budget Amount (planned budget)
  const totalOtherExpenses = project.nonManhourBudgetAmount || 0;

  const handleAddClick = () => {
    setEditingExpense(null);
    setShowModal(true);
  };

  const handleEditClick = (expense: NonManhourExpense) => {
    setEditingExpense(expense);
    setShowModal(true);
  };

  const handleDelete = (id: string) => {
    setProject((prev) => ({
      ...prev,
      nonManhourExpenses: prev.nonManhourExpenses.filter(
        (expense) => expense.id !== id
      ),
    }));
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingExpense(null);
  };

  const handleSave = (expense: NonManhourExpense) => {
    const finalizedExpense = calculateNonManhourCost(expense);

    setProject((prev) => {
      const exists = prev.nonManhourExpenses.some(
        (item) => item.id === finalizedExpense.id
      );

      const updatedExpenses = exists
        ? prev.nonManhourExpenses.map((item) =>
            item.id === finalizedExpense.id ? finalizedExpense : item
          )
        : [...prev.nonManhourExpenses, finalizedExpense];

      return {
        ...prev,
        nonManhourExpenses: updatedExpenses,
      };
    });

    handleCloseModal();
  };

  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">

        {/* Header */}

        <div className="flex items-center justify-between px-6 py-5 border-b">

          <div className="flex items-center gap-3">

            <div className="h-11 w-11 rounded-xl bg-orange-100 flex items-center justify-center">
              <Briefcase className="text-orange-600" size={22} />
            </div>

            <div>

              <h2 className="text-lg font-semibold text-gray-800">
                Other Project Expenses
              </h2>

              <p className="text-sm text-gray-500">
                Record travel, accommodation and other project expenses.
              </p>

            </div>

          </div>

          <button
            onClick={handleAddClick}
            className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-xl transition"
          >
            <Plus size={18} />
            Add Expense
          </button>

        </div>

        {/* Table */}

        <NonManhourExpenseTable
          expenses={expenses}
          onEdit={handleEditClick}
          onDelete={handleDelete}
        />

        {/* Footer */}

        <div className="border-t bg-gray-50 px-6 py-4 flex justify-end">

          <div className="text-right">

            <p className="text-sm text-gray-500">
              Total Other Expenses
            </p>

            <h3 className="text-2xl font-bold text-orange-700 whitespace-nowrap" title={formatFullINR(totalOtherExpenses)}>
              {formatBusinessINR(totalOtherExpenses)}
            </h3>

          </div>

        </div>

      </div>

      {showModal && (
        <NonManhourExpenseModal
          expense={editingExpense}
          onClose={handleCloseModal}
          onSave={handleSave}
        />
      )}
    </>
  );
};

export default NonManhourExpenseCard;
