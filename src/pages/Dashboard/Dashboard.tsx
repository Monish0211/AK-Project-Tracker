import {
  FolderKanban,
  IndianRupee,
  FileText,
  Wallet,
} from "lucide-react";

import KPICard from "../../components/Cards/KPICard";
import ProjectStatusChart from "../../components/Charts/ProjectStatusChart";
import RevenueChart from "../../components/Charts/RevenueChart";

const Dashboard = () => {
  return (
    <div className="min-h-screen bg-slate-100 p-8">

      {/* Header */}

      <h1 className="text-4xl font-bold text-slate-800">
        iFluids PMO Portal
      </h1>

      <p className="text-slate-500 mt-2">
        Engineering Project Management & Operations Portal
      </p>

      {/* KPI Cards */}

      <div className="grid grid-cols-5 gap-6 mt-10">

        <KPICard
          title="Total Projects"
          value="48"
          icon={
            <FolderKanban
              size={35}
              className="text-blue-600"
            />
          }
        />

        <KPICard
          title="Total Work Order Value"
          value="₹82 Cr"
          icon={
            <IndianRupee
              size={35}
              className="text-green-600"
            />
          }
        />

        <KPICard
          title="Invoice Raised"
          value="₹54.25 Cr"
          icon={
            <FileText
              size={35}
              className="text-indigo-600"
            />
          }
        />

        <KPICard
          title="Outstanding"
          value="₹18.40 Cr"
          icon={
            <Wallet
              size={35}
              className="text-red-600"
            />
          }
        />

        <KPICard
          title="Collection Received"
          value="₹35.85 Cr"
          icon={
            <IndianRupee
              size={35}
              className="text-emerald-600"
            />
          }
        />

      </div>

      {/* Charts */}

      <div className="grid grid-cols-2 gap-6 mt-10">

        <ProjectStatusChart />

        <RevenueChart />

      </div>

    </div>
  );
};

export default Dashboard;