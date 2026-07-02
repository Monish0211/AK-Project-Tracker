import WelcomeCard from "./components/WelcomeCard";
import KPISection from "./components/KPISection";
import ProjectStatusChart from "./components/ProjectStatusChart";
import RevenueChart from "./components/RevenueChart";
import DepartmentSummary from "./components/DepartmentSummary";
import TopClients from "./components/TopClients";
import RecentProjects from "./components/RecentProjects";
import QuickActions from "./components/QuickActions";

const Dashboard = () => {
  return (
    <div className="min-h-screen bg-slate-100 p-8 space-y-6">

      <WelcomeCard />

      <KPISection />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ProjectStatusChart />
        <RevenueChart />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <DepartmentSummary />
        <TopClients />
        <RecentProjects />
      </div>

      {/* Full Width */}
      <QuickActions />

    </div>
  );
};

export default Dashboard;