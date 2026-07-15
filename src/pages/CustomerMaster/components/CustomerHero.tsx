import type { ReactNode } from "react";
import { Building2, CalendarDays, Plus, UserCheck, UserX } from "lucide-react";
import { Button } from "../../../components/ui/Button";

interface Props {
  total: number;
  active: number;
  inactive: number;
  addedToday: number;
  onAddCustomer: () => void;
}

const InfoChip = ({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) => (
  <div className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--nu-radius-md)] bg-white/[0.07] border border-white/[0.1] shrink-0">
    <div className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center shrink-0">{icon}</div>
    <div className="leading-tight">
      <p className="text-[9.5px] uppercase tracking-wide text-white/55 font-medium">{label}</p>
      <p className="text-[12.5px] font-semibold text-white whitespace-nowrap">{value}</p>
    </div>
  </div>
);

const CustomerHero = ({ total, active, inactive, addedToday, onAddCustomer }: Props) => {
  return (
    <div
      className="relative overflow-hidden rounded-[var(--nu-radius-lg)] px-5 flex items-center justify-between gap-6 flex-wrap h-[112px]"
      style={{ background: "linear-gradient(120deg, #0f2447 0%, #14335f 45%, #0e5a73 100%)" }}
    >
      <div className="min-w-0">
        <h1 className="text-[26px] font-bold text-white leading-tight">Customer Master</h1>
        <p className="text-[13px] text-[#a9bfda] mt-1 max-w-2xl leading-snug hidden md:block">
          Manage customer organizations used throughout the Engineering PMO Portal.
        </p>
      </div>

      <div className="flex items-center gap-2.5 flex-wrap justify-end">
        <InfoChip icon={<Building2 size={13} className="text-sky-300" />} label="Total Customers" value={total} />
        <InfoChip icon={<UserCheck size={13} className="text-emerald-300" />} label="Active" value={active} />
        <InfoChip icon={<UserX size={13} className="text-red-300" />} label="Inactive" value={inactive} />
        <InfoChip icon={<CalendarDays size={13} className="text-amber-300" />} label="Added Today" value={addedToday} />

        <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={onAddCustomer} className="ml-1">
          Add Customer
        </Button>
      </div>
    </div>
  );
};

export default CustomerHero;
