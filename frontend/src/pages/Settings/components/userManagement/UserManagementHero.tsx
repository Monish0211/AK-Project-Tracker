import { Users, UserCheck, UserX, ShieldCheck, UserCog } from "lucide-react";
import { StatTile } from "../../../../components/ui/StatTile";
import { GlassReflectionOverlay } from "../../../../components/ui/GlassReflectionOverlay";

interface UserManagementHeroProps {
  total: number;
  administrators: number;
  projectManagers: number;
  active: number;
  inactive: number;
}

export const UserManagementHero = ({
  total,
  administrators,
  projectManagers,
  active,
  inactive,
}: UserManagementHeroProps) => {
  return (
    <div className="space-y-3.5">
      {/* Hero Header Banner */}
      <div
        className="relative overflow-hidden rounded-[var(--nu-radius-lg)] px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 border border-[var(--nu-border)] shadow-[var(--nu-shadow-sm)]"
        style={{ background: "linear-gradient(120deg, #0f2447 0%, #14335f 45%, #0e5a73 100%)" }}
      >
        <GlassReflectionOverlay />
        <div className="min-w-0 z-10">
          <p className="text-[10px] uppercase tracking-widest text-white/50 font-semibold mb-1">
            System Administration
          </p>
          <h1 className="text-[24px] font-bold text-white leading-tight truncate">
            User Management & Access Control
          </h1>
          <p className="text-[12.5px] text-[#a9bfda] mt-1 max-w-2xl leading-snug">
            Manage engineering team members, role assignments, module permissions, and project access rights.
          </p>
        </div>
      </div>

      {/* Summary KPI Cards Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatTile
          emphasis="secondary"
          label="Total Users"
          value={total.toString()}
          icon={<Users size={14} />}
          tint="accent"
        />
        <StatTile
          emphasis="secondary"
          label="Administrators"
          value={administrators.toString()}
          icon={<ShieldCheck size={14} />}
          tint="info"
        />
        <StatTile
          emphasis="secondary"
          label="Project Managers"
          value={projectManagers.toString()}
          icon={<UserCog size={14} />}
          tint="warning"
        />
        <StatTile
          emphasis="secondary"
          label="Active Users"
          value={active.toString()}
          icon={<UserCheck size={14} />}
          tint="success"
        />
        <StatTile
          emphasis="secondary"
          label="Inactive Users"
          value={inactive.toString()}
          icon={<UserX size={14} />}
          tint="danger"
        />
      </div>
    </div>
  );
};
