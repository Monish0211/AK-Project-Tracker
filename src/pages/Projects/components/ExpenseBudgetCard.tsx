import type { Dispatch, SetStateAction } from "react";
import { Clock, FileText, IndianRupee } from "lucide-react";
import type { Project } from "../../../types/Project";


interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
}

export default function ExpenseBudgetCard({ project, setProject }: Props) {
  const manhourBudgetAmount = project.manhourBudgetAmount || 0;
  const manhourBudgetHours = project.manhourBudgetHours || 0;
  const manhourBudgetRemarks = project.manhourBudgetRemarks || "";

  const nonManhourBudgetAmount = project.nonManhourBudgetAmount || 0;
  const nonManhourBudgetRemarks = project.nonManhourBudgetRemarks || "";

  const totalProjectBudget = project.workOrderValueINR || 0;
  const totalProjectCost = manhourBudgetAmount + nonManhourBudgetAmount;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Man-Hour Budget */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <IndianRupee size={18} strokeWidth={2.25} />
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Man-Hour Budget
            </p>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-800">
            ₹{manhourBudgetAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        {/* Total Non Man-Hour Budget */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
              <IndianRupee size={18} strokeWidth={2.25} />
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Non Man-Hour Budget
            </p>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-800">
            ₹{nonManhourBudgetAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        {/* Total Project Budget */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-600">
              <IndianRupee size={18} strokeWidth={2.25} />
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Project Budget
            </p>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-800">
            ₹{totalProjectBudget.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        {/* Total Project Cost */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
              <IndianRupee size={18} strokeWidth={2.25} />
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Project Cost
            </p>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-800">
            ₹{totalProjectCost.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Man-Hour Expense Budget */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
          <h3 className="text-lg font-bold text-slate-800 border-b pb-3 flex items-center gap-2">
            <Clock size={20} className="text-blue-500" />
            Man-Hour Expense Budget
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Budget Amount (INR)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-slate-400 text-sm font-semibold">₹</span>
                <input
                  type="number"
                  value={manhourBudgetAmount || ""}
                  onChange={(e) =>
                    setProject((prev) => ({
                      ...prev,
                      manhourBudgetAmount: parseFloat(e.target.value) || 0,
                    }))
                  }
                  placeholder="Enter Man-Hour Budget Amount"
                  className="w-full border border-gray-300 rounded-xl pl-8 pr-3 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Budget Hours
              </label>
              <input
                type="number"
                value={manhourBudgetHours || ""}
                onChange={(e) =>
                  setProject((prev) => ({
                    ...prev,
                    manhourBudgetHours: parseFloat(e.target.value) || 0,
                  }))
                }
                placeholder="Enter Budget Hours"
                className="w-full border border-gray-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Remarks
              </label>
              <textarea
                value={manhourBudgetRemarks}
                onChange={(e) =>
                  setProject((prev) => ({
                    ...prev,
                    manhourBudgetRemarks: e.target.value,
                  }))
                }
                placeholder="Enter remarks (e.g. Engineering Estimate)"
                rows={3}
                className="w-full border border-gray-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Non Man-Hour Expense Budget */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
          <h3 className="text-lg font-bold text-slate-800 border-b pb-3 flex items-center gap-2">
            <FileText size={20} className="text-purple-500" />
            Non Man-Hour Expense Budget
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Non Man-Hour Budget Amount (INR)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-slate-400 text-sm font-semibold">₹</span>
                <input
                  type="number"
                  value={nonManhourBudgetAmount || ""}
                  onChange={(e) =>
                    setProject((prev) => ({
                      ...prev,
                      nonManhourBudgetAmount: parseFloat(e.target.value) || 0,
                    }))
                  }
                  placeholder="Enter Non Man-Hour Budget Amount"
                  className="w-full border border-gray-300 rounded-xl pl-8 pr-3 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Remarks
              </label>
              <textarea
                value={nonManhourBudgetRemarks}
                onChange={(e) =>
                  setProject((prev) => ({
                    ...prev,
                    nonManhourBudgetRemarks: e.target.value,
                  }))
                }
                placeholder="Enter remarks (e.g. Travel, Hotel, Accommodation)"
                rows={7}
                className="w-full border border-gray-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
