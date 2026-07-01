import type { Dispatch, SetStateAction } from "react";
import type { Project } from "../../../types/Project";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
}

const ExpenseCard = ({ project, setProject }: Props) => {
  const calculateExpenses = (
    manhour: number,
    nonManhour: number
  ) => {
    const totalExpenses = manhour + nonManhour;

    const profit =
      project.paymentReceivedINR - totalExpenses;

    const profitPercentage =
      project.paymentReceivedINR === 0
        ? 0
        : (profit / project.paymentReceivedINR) * 100;

    setProject({
      ...project,
      manhourExpenses: manhour,
      nonManhourExpenses: nonManhour,
      totalExpenses,
      profit,
      profitPercentage,
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-6">

      <h2 className="text-2xl font-semibold mb-6">
        Expense Information
      </h2>

      <div className="grid grid-cols-2 gap-6">

        {/* Manhour Expenses */}

        <div>
          <label className="block text-sm font-medium mb-2">
            Manhour Expenses
          </label>

          <input
            type="number"
            placeholder="Enter Manhour Expenses"
            value={
              project.manhourExpenses === 0
                ? ""
                : project.manhourExpenses
            }
            onChange={(e) =>
              calculateExpenses(
                e.target.value === ""
                  ? 0
                  : Number(e.target.value),
                project.nonManhourExpenses
              )
            }
            className="w-full border rounded-lg p-3"
          />
        </div>

        {/* Non-Manhour Expenses */}

        <div>
          <label className="block text-sm font-medium mb-2">
            Non-Manhour Expenses
          </label>

          <input
            type="number"
            placeholder="Enter Non-Manhour Expenses"
            value={
              project.nonManhourExpenses === 0
                ? ""
                : project.nonManhourExpenses
            }
            onChange={(e) =>
              calculateExpenses(
                project.manhourExpenses,
                e.target.value === ""
                  ? 0
                  : Number(e.target.value)
              )
            }
            className="w-full border rounded-lg p-3"
          />
        </div>

        {/* Total Expenses */}

        <div>
          <label className="block text-sm font-medium mb-2">
            Total Expenses
          </label>

          <input
            type="text"
            readOnly
            value={project.totalExpenses.toLocaleString(
              "en-IN",
              {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }
            )}
            className="w-full border rounded-lg p-3 bg-gray-100 font-semibold text-red-600"
          />
        </div>

        {/* Profit */}

        <div>
          <label className="block text-sm font-medium mb-2">
            Profit
          </label>

          <input
            type="text"
            readOnly
            value={project.profit.toLocaleString(
              "en-IN",
              {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }
            )}
            className={`w-full border rounded-lg p-3 bg-gray-100 font-semibold ${
              project.profit >= 0
                ? "text-green-600"
                : "text-red-600"
            }`}
          />
        </div>

        {/* Profit Percentage */}

        <div>
          <label className="block text-sm font-medium mb-2">
            Profit Percentage
          </label>

          <input
            type="text"
            readOnly
            value={`${project.profitPercentage.toFixed(
              2
            )}%`}
            className={`w-full border rounded-lg p-3 bg-gray-100 font-semibold ${
              project.profitPercentage >= 0
                ? "text-green-600"
                : "text-red-600"
            }`}
          />
        </div>

      </div>

    </div>
  );
};

export default ExpenseCard;