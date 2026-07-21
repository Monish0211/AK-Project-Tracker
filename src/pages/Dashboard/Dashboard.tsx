import "./dashboard-theme.css";
import DashboardToolbar from "./components/DashboardToolbar";
import HeroBar from "./components/HeroBar";
import ProjectsInLossHoursWidget from "./components/ProjectsInLossHoursWidget";
import ProjectsInLossTimeWidget from "./components/ProjectsInLossTimeWidget";
import KPISection from "./components/KPISection";
import TeamLeadsWorkloadWidget from "./components/TeamLeadsWorkloadWidget";
import ProjectStatusChart from "./components/ProjectStatusChart";
import RevenueChart from "./components/RevenueChart";
import ProjectHealthSummary from "./components/ProjectHealthSummary";
import ActivityFeed from "./components/ActivityFeed";
import DepartmentSummary from "./components/DepartmentSummary";
import TopClients from "./components/TopClients";
import RecentProjects from "./components/RecentProjects";
import QuickActions from "./components/QuickActions";
import { useLiveRefresh } from "../../hooks/useLiveRefresh";

const Dashboard = () => {
  const { refreshKey, lastUpdated, refresh } = useLiveRefresh();

  return (
    <div className="dashboard-shell -m-6">
      <DashboardToolbar onRefresh={refresh} />

      <div key={refreshKey} className="p-4 space-y-3.5 nu-fade-in">
        <HeroBar lastUpdated={lastUpdated} />

        <KPISection />

        {/* Executive Risk Section Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          <ProjectsInLossHoursWidget />
          <ProjectsInLossTimeWidget />
        </div>

        {/* Team Leads Workload & Performance Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3.5">
          <TeamLeadsWorkloadWidget />
          <ProjectStatusChart />
          <RevenueChart />
        </div>

        {/* Timeline & Portfolio Summaries Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          <ActivityFeed />
          <TopClients />
          <ProjectHealthSummary />
        </div>

        {/* Supporting Operational Summaries */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          <DepartmentSummary />
          <RecentProjects />
        </div>

        <QuickActions />
      </div>
    </div>
  );
};

export default Dashboard;
