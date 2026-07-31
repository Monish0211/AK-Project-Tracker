import type { ReactNode } from "react";

export interface HeroKpiItem {
  id: string;
  label: string;
  value: string | number;
  icon: ReactNode;
}

interface HeroKpiGridProps {
  items: HeroKpiItem[];
  className?: string;
}

export const HeroKpiGrid = ({ items, className = "" }: HeroKpiGridProps) => {
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 w-full sm:w-auto ${className}`}>
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-[var(--nu-radius-md)] bg-white/[0.08] border border-white/[0.12] hover:bg-white/[0.12] hover:border-white/[0.2] transition-all duration-150 shadow-xs h-[48px] min-w-[130px] sm:min-w-[140px] flex-1"
        >
          <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0 shadow-inner">
            {item.icon}
          </div>
          <div className="leading-tight min-w-0 flex-1">
            <p className="text-[9.5px] uppercase tracking-wider text-white/60 font-semibold truncate">
              {item.label}
            </p>
            <p className="text-[14px] font-extrabold text-white tracking-tight leading-none mt-0.5 truncate">
              {item.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};
