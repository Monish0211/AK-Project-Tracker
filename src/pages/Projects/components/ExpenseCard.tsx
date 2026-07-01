import type { Dispatch, SetStateAction } from "react";
import type { Project } from "../../../types/Project";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
}

const ExpenseCard = ({ project, setProject }: Props) => {
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
            value={project.manhourExpenses}
            onChange={(e) => {
              const manhour = Number(e.target.value);

              setProject({
                ...project,
                manhourExpenses: manhour,
                totalExpenses: manhour + project.nonManhourExpenses,
                profit:
                  project.paymentReceivedINR -
                  (manhour + project.nonManhourExpenses),
                profitPercentage:
                  project.paymentReceivedINR === 0
                    ? 0
                    : ((project.paymentReceivedINR -
                        (manhour + project.nonManhourExpenses)) /
                        project.paymentReceivedINR) *
                      100,
              });
            }}
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
            value={project.nonManhourExpenses}
            onChange={(e) => {
              const nonManhour = Number(e.target.value);

              setProject({
                ...project,
                nonManhourExpenses: nonManhour,
                totalExpenses: project.manhourExpenses + nonManhour,
                profit:
                  project.paymentReceivedINR -
                  (project.manhourExpenses + nonManhour),
                profitPercentage:
                  project.paymentReceivedINR === 0
                    ? 0
                    : ((project.paymentReceivedINR -
                        (project.manhourExpenses + nonManhour)) /
                        project.paymentReceivedINR) *
                      100,
              });
            }}
            className="w-full border rounded-lg p-3"
          />
        </div>

        {/* Total Expenses */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Total Expenses
          </label>

          <input
            type="number"
            value={project.totalExpenses}
            readOnly
            className="w-full border rounded-lg p-3 bg-gray-100"
          />
        </div>

        {/* Profit */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Profit
          </label>

          <input
            type="number"
            value={project.profit}
            readOnly
            className="w-full border rounded-lg p-3 bg-gray-100"
          />
        </div>

        {/* Profit Percentage */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Profit %
          </label>

          <input
            type="number"
            value={project.profitPercentage.toFixed(2)}
            readOnly
            className="w-full border rounded-lg p-3 bg-gray-100"
          />
        </div>

      </div>
    </div>
  );
};

export default ExpenseCard;