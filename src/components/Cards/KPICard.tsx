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
    <div
      className="
        relative
        overflow-hidden
        rounded-2xl
        bg-white
        p-6
        shadow-md
        border
        border-gray-100
        transition-all
        duration-300
        hover:-translate-y-1
        hover:shadow-xl
      "
    >
      {/* Top Accent */}
      <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-blue-600 to-cyan-500" />

      {/* Header */}
      <div className="flex justify-between items-start">

        <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-slate-100">
          {icon}
        </div>

        <span className="text-xs font-medium bg-green-100 text-green-700 px-2 py-1 rounded-full">
          Live
        </span>

      </div>

      <p className="mt-6 text-gray-500 text-sm">
        {title}
      </p>

      <h2 className="mt-2 text-3xl font-bold text-slate-800">
        {value}
      </h2>

      <div className="mt-6 flex justify-between items-center">

        <span className="text-xs text-gray-400">
          Updated from Projects
        </span>

        <ArrowUpRight
          size={18}
          className="text-blue-600"
        />

      </div>
    </div>
  );
};

export default KPICard;