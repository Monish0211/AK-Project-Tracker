import "./dashboard-theme.css";
import DashboardAtmosphere from "./components/DashboardAtmosphere";
import DashboardToolbar from "./components/DashboardToolbar";
import HeroBar from "./components/HeroBar";
import ProjectsInLossHoursWidget from "./components/ProjectsInLossHoursWidget";
import ProjectsInLossTimeWidget from "./components/ProjectsInLossTimeWidget";
import KPISection from "./components/KPISection";
import TeamLeadsWorkloadWidget from "./components/TeamLeadsWorkloadWidget";
import ProjectTimesheetPendingWidget from "./components/ProjectTimesheetPendingWidget";
import PMOAlertsWidget from "./components/PMOAlertsWidget";
import ProjectHealthSummary from "./components/ProjectHealthSummary";
import ActivityFeed from "./components/ActivityFeed";
import DepartmentSummary from "./components/DepartmentSummary";
import TopClients from "./components/TopClients";
import RecentProjects from "./components/RecentProjects";
import { useLiveRefresh } from "../../hooks/useLiveRefresh";

// Toggle for the dashboard's ambient background (see DashboardAtmosphere.tsx).
// Flip to false to disable instantly without removing any code; delete
// DashboardAtmosphere.tsx + dashboard-atmosphere.css + this flag + the
// <DashboardAtmosphere /> line below to remove the feature entirely.
//
// The earlier Aurora prototype (DashboardAurora.tsx / dashboard-aurora.css)
// is frozen and left on disk, unused, in case of future reference — it is
// no longer rendered here.
const ENABLE_DASHBOARD_BACKGROUND = true;

const Dashboard = () => {
  const { refreshKey, lastUpdated, refresh } = useLiveRefresh();

  return (
    <div className="dashboard-shell -m-6">
      {ENABLE_DASHBOARD_BACKGROUND && <DashboardAtmosphere />}

      <div className="relative z-[1]">
        <DashboardToolbar onRefresh={refresh} />

        <div key={refreshKey} className="p-4 space-y-3.5 nu-fade-in">
          <HeroBar lastUpdated={lastUpdated} />

          {/* KPI Cards — unchanged */}
          <KPISection />

          {/* Executive Risk Section Grid — unchanged */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            <ProjectsInLossHoursWidget />
            <ProjectsInLossTimeWidget />
          </div>

          {/* Team Leads Workload (kept) + Project Timesheet Pending
          (replaces Invoice Collection Due) + PMO Alerts */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3.5">
            <TeamLeadsWorkloadWidget />
            <ProjectTimesheetPendingWidget />
            <PMOAlertsWidget />
          </div>

          {/* Timeline & Portfolio Summaries Row — unchanged */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            <ActivityFeed />
            <TopClients />
            <ProjectHealthSummary />
          </div>

          {/* Department Summary — full width */}
          <DepartmentSummary />

          {/* Recent Projects — compact card replacing Quick Actions */}
          <RecentProjects />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
