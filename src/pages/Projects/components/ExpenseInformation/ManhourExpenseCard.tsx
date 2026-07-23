import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Plus, Users } from "lucide-react";

import type { Project } from "../../../../types/Project";
import type { ManhourExpense } from "../../../../types/ManhourExpense";

import {
  calculateManhourCost,
  getTotalManhourCost,
} from "../../../../services/expenseService";
import { formatBusinessINR, formatFullINR } from "../../../../utils/formatCurrency";

import ManhourExpenseModal from "./ManhourExpenseModal";
import ManhourExpenseTable from "./ManhourExpenseTable";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
}

const ManhourExpenseCard = ({ project, setProject }: Props) => {
  const expenses = project.manhourExpenses;

  const [showModal, setShowModal] = useState(false);

  const [editingExpense, setEditingExpense] = useState<ManhourExpense | null>(
    null
  );

  const totalManhourCost = getTotalManhourCost(expenses);

  const handleAddClick = () => {
    setEditingExpense(null);
    setShowModal(true);
  };

  const handleEditClick = (expense: ManhourExpense) => {
    setEditingExpense(expense);
    setShowModal(true);
  };

  const handleDelete = (id: string) => {
    setProject((prev) => ({
      ...prev,
      manhourExpenses: prev.manhourExpenses.filter(
        (expense) => expense.id !== id
      ),
    }));
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingExpense(null);
  };

  const handleSave = (expense: ManhourExpense) => {
    const finalizedExpense = calculateManhourCost(expense);

    setProject((prev) => {
      const exists = prev.manhourExpenses.some(
        (item) => item.id === finalizedExpense.id
      );

      const updatedExpenses = exists
        ? prev.manhourExpenses.map((item) =>
            item.id === finalizedExpense.id ? finalizedExpense : item
          )
        : [...prev.manhourExpenses, finalizedExpense];

      return {
        ...prev,
        manhourExpenses: updatedExpenses,
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

            <div className="h-11 w-11 rounded-xl bg-blue-100 flex items-center justify-center">
              <Users className="text-blue-600" size={22} />
            </div>

            <div>

              <h2 className="text-lg font-semibold text-gray-800">
                Man-Hour Expenses
              </h2>

              <p className="text-sm text-gray-500">
                Add employee working hours and calculate manpower cost.
              </p>

            </div>

          </div>

          <button
            onClick={handleAddClick}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition"
          >
            <Plus size={18} />
            Add Employee
          </button>

        </div>

        {/* Table */}

        <ManhourExpenseTable
          expenses={expenses}
          onEdit={handleEditClick}
          onDelete={handleDelete}
        />

        {/* Footer */}

        <div className="border-t bg-gray-50 px-6 py-4 flex justify-end">

          <div className="text-right">

            <p className="text-sm text-gray-500">
              Total Man-Hour Cost
            </p>

            <h2 className="text-2xl font-bold text-blue-700 whitespace-nowrap" title={formatFullINR(totalManhourCost)}>
              {formatBusinessINR(totalManhourCost)}
            </h2>

          </div>

        </div>

      </div>

      {showModal && (
        <ManhourExpenseModal
          expense={editingExpense}
          onClose={handleCloseModal}
          onSave={handleSave}
        />
      )}
    </>
  );
};

export default ManhourExpenseCard;
