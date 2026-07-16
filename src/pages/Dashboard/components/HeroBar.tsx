import { useEffect, useState } from "react";
import { CalendarDays, Clock3, FolderKanban, Wifi } from "lucide-react";
import { getDashboardMetrics } from "../../../services/dashboardService";

interface Props {
  lastUpdated: Date;
}

const InfoChip = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--nu-radius-md)] bg-white/[0.07] border border-white/[0.1] shrink-0">
    <div className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center shrink-0">{icon}</div>
    <div className="leading-tight">
      <p className="text-[9.5px] uppercase tracking-wide text-white/55 font-medium">{label}</p>
      <p className="text-[12.5px] font-semibold text-white whitespace-nowrap">{value}</p>
    </div>
  </div>
);

const HeroBar = ({ lastUpdated }: Props) => {
  const [today, setToday] = useState(() => new Date());
  const metrics = getDashboardMetrics();

  // Re-checks once a minute so "Today" rolls over at midnight without a manual refresh.
  useEffect(() => {
    const id = setInterval(() => setToday(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const dateStr = today.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  const timeStr = lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      className="relative overflow-hidden rounded-[var(--nu-radius-lg)] px-5 py-[18px] lg:py-0 flex items-center justify-between gap-5 flex-wrap min-h-[112px]"
      style={{ background: "linear-gradient(120deg, #0f2447 0%, #14335f 45%, #0e5a73 100%)" }}
    >
      <div className="min-w-0">
        <h1 className="text-[20px] sm:text-[23px] lg:text-[26px] font-bold text-white leading-tight">Engineering Project Management Dashboard</h1>
        <p className="text-[12.5px] text-[#a9bfda] mt-1 max-w-xl leading-snug hidden md:block">
          Monitor project execution, commercial performance, invoicing, profitability and operational health across
          all active engineering projects.
        </p>
      </div>

      <div className="grid grid-cols-2 min-[1440px]:flex min-[1440px]:items-center gap-2.5 shrink-0 justify-end">
        <InfoChip icon={<Wifi size={13} className="text-emerald-300" />} label="System Status" value="Online" />
        <InfoChip icon={<CalendarDays size={13} className="text-sky-300" />} label="Today" value={dateStr} />
        <InfoChip icon={<Clock3 size={13} className="text-cyan-300" />} label="Last Updated" value={timeStr} />
        <InfoChip icon={<FolderKanban size={13} className="text-amber-300" />} label="Total Projects" value={metrics.totalProjects.toString()} />
      </div>
    </div>
  );
};

export default HeroBar;
