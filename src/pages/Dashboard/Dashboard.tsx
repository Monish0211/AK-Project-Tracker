import WelcomeCard from "./components/WelcomeCard";
import KPISection from "./components/KPISection";
import ProjectStatusChart from "./components/ProjectStatusChart";
import RevenueChart from "./components/RevenueChart";
import DepartmentSummary from "./components/DepartmentSummary";
import TopClients from "./components/TopClients";
import RecentProjects from "./components/RecentProjects";

const Dashboard = () => {
  return (
    <div className="min-h-screen bg-slate-100 p-8 space-y-6">

      {/* Welcome Card */}
      <WelcomeCard />

      {/* KPI Cards */}
      <KPISection />

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        <ProjectStatusChart />

        <RevenueChart />

      </div>

      {/* Department Summary & Top Clients */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        <DepartmentSummary />

        <TopClients />

      </div>

      {/* Recent Projects & Quick Actions */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        <RecentProjects />

        <div className="bg-white rounded-2xl shadow-md p-6 flex items-center justify-center text-gray-400 text-lg font-medium">
          Quick Actions (Coming Next)
        </div>

      </div>

    </div>
  );
};

export default Dashboard;