import React from "react";
import { AlertCircle, ArrowRight, DollarSign } from "lucide-react";
import { useNavigate } from "react-router-dom";

export interface FinancialRiskItem {
  id: string;
  prNumber: string;
  projectName: string;
  category: string;
  impactAmount: string;
  pendingDays: string;
  severity: "At Risk" | "High Risk" | "Medium Risk" | "Low Risk";
}

const MOCK_FINANCIAL_RISKS: FinancialRiskItem[] = [
  {
    id: "1",
    prNumber: "PR-8102",
    projectName: "LTM Study for ONGC",
    category: "Overdue Invoice",
    impactAmount: "₹ 18.5 Lakhs",
    pendingDays: "42 Days Overdue",
    severity: "At Risk",
  },
  {
    id: "2",
    prNumber: "PR-7140",
    projectName: "HAZOP Analysis",
    category: "Unbilled Milestone",
    impactAmount: "₹ 12.0 Lakhs",
    pendingDays: "28 Days Pending",
    severity: "At Risk",
  },
  {
    id: "3",
    prNumber: "PR-6501",
    projectName: "Safety Audit Petronet",
    category: "Low Margin Alert",
    impactAmount: "₹ 8.2 Lakhs",
    pendingDays: "15 Days Margin Deficit",
    severity: "At Risk",
  },
];

const FinancialRiskWidget: React.FC = () => {
  const navigate = useNavigate();

  const handleNavigateToReports = () => {
    navigate("/reports");
  };

  const handleNavigateToProject = (prNumber: string) => {
    navigate(`/projects?search=${encodeURIComponent(prNumber)}`);
  };

  return (
    <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-2xl shadow-md border border-slate-200/80 dark:border-slate-800/80 border-l-4 border-l-rose-500 p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:shadow-lg">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 border border-rose-500/20 shadow-xs">
            <AlertCircle size={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight">
                Financial Risk Overview
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
              Projects requiring commercial, billing, or milestone intervention.
            </p>
          </div>
        </div>

        {/* Right Badge / Action */}
        <div className="flex items-center gap-3 shrink-0 self-start sm:self-center">
          <span className="bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300/60 dark:border-rose-800/60 px-3 py-1 rounded-full text-xs font-semibold shadow-xs">
            {MOCK_FINANCIAL_RISKS.length} Commercial Risks
          </span>
          <button
            type="button"
            onClick={handleNavigateToReports}
            className="text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 transition-colors flex items-center gap-1 hover:underline cursor-pointer group"
          >
            <span>View Risks</span>
            <ArrowRight size={13} className="transition-transform duration-150 group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>

      {/* Desktop / Tablet Table */}
      <div className="hidden sm:block overflow-x-auto mt-4">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200/80 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px] bg-slate-50/60 dark:bg-slate-800/40">
              <th className="py-2.5 px-3 rounded-l-lg">PR Number</th>
              <th className="py-2.5 px-3">Project Name</th>
              <th className="py-2.5 px-3">Category</th>
              <th className="py-2.5 px-3">Impact Value</th>
              <th className="py-2.5 px-3 text-right rounded-r-lg">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {MOCK_FINANCIAL_RISKS.map((item) => (
              <tr
                key={item.id}
                onClick={() => handleNavigateToProject(item.prNumber)}
                className="hover:bg-rose-50/40 dark:hover:bg-slate-800/50 transition-colors duration-150 group cursor-pointer"
              >
                <td className="py-3 px-3 font-bold text-blue-600 dark:text-blue-400 group-hover:text-blue-700 dark:group-hover:text-blue-300 group-hover:underline whitespace-nowrap">
                  {item.prNumber}
                </td>

                <td className="py-3 px-3">
                  <div className="flex items-center gap-2">
                    <DollarSign size={14} className="text-slate-400 dark:text-slate-500 shrink-0 group-hover:text-rose-500 transition-colors" />
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[170px] lg:max-w-[210px]" title={item.projectName}>
                      {item.projectName}
                    </span>
                  </div>
                </td>

                <td className="py-3 px-3 text-slate-600 dark:text-slate-400 font-medium whitespace-nowrap">
                  {item.category}
                </td>

                <td className="py-3 px-3 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                  {item.impactAmount}
                </td>

                <td className="py-3 px-3 text-right whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-800 text-white border border-red-900/40 shadow-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    {item.severity}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Stacked View */}
      <div className="sm:hidden space-y-3 mt-4">
        {MOCK_FINANCIAL_RISKS.map((item) => (
          <div
            key={item.id}
            onClick={() => handleNavigateToProject(item.prNumber)}
            className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 hover:bg-rose-50/50 dark:hover:bg-slate-800/80 transition-all cursor-pointer space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-blue-600 dark:text-blue-400 hover:underline">
                {item.prNumber}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-red-800 text-white border border-red-900/40 shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                {item.severity}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <DollarSign size={14} className="text-slate-400 shrink-0" />
              <span className="font-semibold text-xs text-slate-800 dark:text-slate-200">
                {item.projectName}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-[11px]">
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-medium">Category</p>
                <p className="font-medium text-slate-700 dark:text-slate-300">{item.category}</p>
              </div>
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-medium">Impact Value</p>
                <p className="font-bold text-slate-900 dark:text-white">{item.impactAmount}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FinancialRiskWidget;
