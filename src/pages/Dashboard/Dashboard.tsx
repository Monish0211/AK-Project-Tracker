import "./dashboard-theme.css";
import DashboardToolbar from "./components/DashboardToolbar";
import HeroBar from "./components/HeroBar";
import KPISection from "./components/KPISection";
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

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
          <ProjectStatusChart />
          <RevenueChart />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3.5">
          <ProjectHealthSummary />
          <div className="xl:col-span-2">
            <ActivityFeed />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3.5">
          <DepartmentSummary />
          <TopClients />
          <RecentProjects />
        </div>

        <QuickActions />
      </div>
    </div>
  );
};

export default Dashboard;
