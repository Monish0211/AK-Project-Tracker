import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";

interface Props {
  title: string;
  value: string;
  icon: ReactNode;
}

const KPICard = ({
  title,
  value,
  icon,
}: Props) => {
  return (
    <div className="kpi-card-wrapper bg-white dark:bg-[#1E293B] border border-gray-100 dark:border-slate-800 shadow-md p-6 rounded-2xl transition duration-200">
      {/* Top Accent */}
      <div className="kpi-accent-line" />

      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-800">
          {icon}
        </div>

        <span className="text-xs font-medium bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-2 py-1 rounded-full">
          Live
        </span>
      </div>

      <p className="mt-6 text-gray-500 dark:text-slate-400 text-sm">
        {title}
      </p>

      <h2 className="mt-2 text-3xl font-bold text-slate-800 dark:text-slate-100">
        {value}
      </h2>

      <div className="mt-6 flex justify-between items-center">
        <span className="text-xs text-gray-400 dark:text-slate-500">
          Updated from Projects
        </span>

        <ArrowUpRight
          size={18}
          className="text-blue-600 dark:text-blue-400"
        />
      </div>
    </div>
  );
};

export default KPICard;