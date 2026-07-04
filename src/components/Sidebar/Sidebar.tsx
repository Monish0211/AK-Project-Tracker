import { NavLink } from "react-router-dom";
import {
  BarChart3,
  Briefcase,
  Clock3,
  Droplet,
  FileText,
  FolderKanban,
  FolderOpen,
  LayoutDashboard,
  PackageCheck,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard },
  { label: "Projects", to: "/projects", icon: FolderKanban },
  { label: "Deliverables", to: "/deliverables", icon: PackageCheck },
  { label: "Invoices", to: "/invoices", icon: FileText },
  { label: "Expenses", to: "/expenses", icon: Wallet },
  { label: "Manpower", to: "/manpower", icon: Users },
  { label: "Timesheets", to: "/timesheets", icon: Clock3 },
  { label: "Reports", to: "/reports", icon: BarChart3 },
  { label: "Documents", to: "/documents", icon: FolderOpen },
  { label: "Resources", to: "/resources", icon: Briefcase },
  { label: "Settings", to: "/settings", icon: Settings },
];

interface SummaryRow {
  dot: string;
  label: string;
  value: number;
}

const SUMMARY_ROWS: SummaryRow[] = [
  { dot: "bg-green-400", label: "Active Projects", value: 25 },
  { dot: "bg-yellow-400", label: "On Hold", value: 8 },
  { dot: "bg-blue-400", label: "Completed", value: 15 },
  { dot: "bg-red-400", label: "Cancelled", value: 2 },
];

const Sidebar = () => {
  return (
    <aside
      className="
        sticky
        top-0
        h-screen
        w-[260px]
        flex-shrink-0
        bg-gradient-to-b
        from-[#0F172A]
        via-[#12284C]
        to-[#0B1F3A]
        text-white
        shadow-2xl
        flex
        flex-col
      "
    >
      {/* Branding */}

      <div className="px-6 py-6">

        <div className="flex items-center gap-3">

          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-900/40">

            <Droplet
              size={22}
              className="text-white"
            />

          </div>

          <div>

            <h1 className="text-lg font-bold">
              iFluids
            </h1>

            <p className="text-xs uppercase tracking-wider text-slate-400">
              PMO Portal
            </p>

          </div>

        </div>

      </div>

      <div className="mx-6 border-t border-white/10" />

      {/* Navigation */}

      <nav className="flex-1 overflow-y-auto px-4 py-5">

        <ul className="space-y-2">

          {NAV_ITEMS.map(({ label, to, icon: Icon }) => (

            <li key={to}>

              <NavLink
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `
                  flex
                  items-center
                  gap-3
                  rounded-xl
                  px-4
                  py-3
                  text-sm
                  font-medium
                  transition-all
                  duration-300
                  ${
                    isActive
                      ? "bg-gradient-to-r from-blue-600 to-cyan-500 shadow-lg shadow-blue-900/40"
                      : "text-slate-300 hover:bg-white/10 hover:text-white hover:translate-x-1"
                  }
                `
                }
              >

                <Icon
                  size={19}
                  className="shrink-0"
                />

                <span>{label}</span>

              </NavLink>

            </li>

          ))}

        </ul>

      </nav>

      {/* Bottom Summary */}

      <div className="p-4">

        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">

          <h3 className="mb-4 text-sm font-semibold">
            Quick Summary
          </h3>

          <div className="space-y-3">

            {SUMMARY_ROWS.map(({ dot, label, value }) => (

              <div
                key={label}
                className="flex items-center justify-between text-sm"
              >

                <div className="flex items-center gap-2">

                  <span
                    className={`h-2.5 w-2.5 rounded-full ${dot}`}
                  />

                  <span className="text-slate-300">
                    {label}
                  </span>

                </div>

                <span className="font-semibold">
                  {value}
                </span>

              </div>

            ))}

          </div>

        </div>

      </div>

    </aside>
  );
};

export default Sidebar;