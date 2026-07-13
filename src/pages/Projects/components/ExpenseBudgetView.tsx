import type { Project } from "../../../types/Project";
import InfoField from "./InfoField";
import InfoSection from "./InfoSection";

interface Props {
  project: Project;
}

export default function ExpenseBudgetView({ project }: Props) {
  const manhourBudgetAmount = project.manhourBudgetAmount || 0;
  const manhourBudgetHours = project.manhourBudgetHours || 0;
  const manhourBudgetRemarks = project.manhourBudgetRemarks || "";

  const nonManhourBudgetAmount = project.nonManhourBudgetAmount || 0;
  const nonManhourBudgetRemarks = project.nonManhourBudgetRemarks || "";

  const totalProjectBudget = project.workOrderValueINR || 0;
  const totalProjectCost = manhourBudgetAmount + nonManhourBudgetAmount;

  return (
    <InfoSection title="Expense Budget">
      <div className="col-span-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {/* Total Man-Hour Budget */}
        <div className="bg-slate-50 rounded-xl p-4 border border-gray-100 shadow-sm flex flex-col justify-between">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Total Man-Hour Budget
          </p>
          <p className="mt-2 text-xl font-bold text-slate-800">
            ₹{manhourBudgetAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        {/* Total Non Man-Hour Budget */}
        <div className="bg-slate-50 rounded-xl p-4 border border-gray-100 shadow-sm flex flex-col justify-between">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Total Non Man-Hour Budget
          </p>
          <p className="mt-2 text-xl font-bold text-slate-800">
            ₹{nonManhourBudgetAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        {/* Total Project Budget */}
        <div className="bg-slate-50 rounded-xl p-4 border border-gray-100 shadow-sm flex flex-col justify-between">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Total Project Budget
          </p>
          <p className="mt-2 text-xl font-bold text-slate-800">
            ₹{totalProjectBudget.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        {/* Total Project Cost */}
        <div className="bg-slate-50 rounded-xl p-4 border border-gray-100 shadow-sm flex flex-col justify-between">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Total Project Cost
          </p>
          <p className="mt-2 text-xl font-bold text-slate-800">
            ₹{totalProjectCost.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      <InfoField
        label="Man-Hour Budget Hours"
        value={`${manhourBudgetHours.toLocaleString("en-IN")} Hrs`}
      />

      <InfoField
        label="Man-Hour Budget Remarks"
        value={manhourBudgetRemarks || "—"}
      />

      <div className="col-span-2 border-t border-slate-100 my-2"></div>

      <InfoField
        label="Non Man-Hour Budget Remarks"
        value={nonManhourBudgetRemarks || "—"}
      />
    </InfoSection>
  );
}
