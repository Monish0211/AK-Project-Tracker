import { Building2, CalendarDays, UserCheck, UserX } from "lucide-react";
import { GlassReflectionOverlay } from "../../../components/ui/GlassReflectionOverlay";
import { HeroKpiGrid, type HeroKpiItem } from "../../../components/ui/HeroKpiGrid";

interface Props {
  total: number;
  active: number;
  inactive: number;
  addedToday: number;
}

const CustomerHero = ({ total, active, inactive, addedToday }: Props) => {
  const kpiItems: HeroKpiItem[] = [
    {
      id: "total",
      label: "Total Customers",
      value: total,
      icon: <Building2 size={14} className="text-sky-300" />,
    },
    {
      id: "active",
      label: "Active",
      value: active,
      icon: <UserCheck size={14} className="text-emerald-300" />,
    },
    {
      id: "inactive",
      label: "Inactive",
      value: inactive,
      icon: <UserX size={14} className="text-red-300" />,
    },
    {
      id: "addedToday",
      label: "Added Today",
      value: addedToday,
      icon: <CalendarDays size={14} className="text-amber-300" />,
    },
  ];

  return (
    <div
      className="relative overflow-hidden rounded-[var(--nu-radius-lg)] p-5 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-5 border border-[var(--nu-border)] shadow-[var(--nu-shadow-sm)]"
      style={{ background: "linear-gradient(120deg, #0f2447 0%, #14335f 45%, #0e5a73 100%)" }}
    >
      <GlassReflectionOverlay />
      
      {/* Title & Subtitle */}
      <div className="min-w-0 z-10 flex-1">
        <h1 className="text-2xl sm:text-[26px] font-extrabold text-white tracking-tight leading-tight">
          Customer Master
        </h1>
        <p className="text-[13px] text-[#a9bfda] mt-1 max-w-xl leading-snug">
          Manage customer organizations used throughout the Engineering PMO Portal.
        </p>
      </div>

      {/* Uniform Responsive KPI Grid */}
      <div className="z-10 shrink-0">
        <HeroKpiGrid items={kpiItems} />
      </div>
    </div>
  );
};

export default CustomerHero;
