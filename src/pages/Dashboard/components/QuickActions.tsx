import {
  Plus,
  FileText,
  Receipt,
  Users,
  BarChart3,
  Upload,
  Download,
} from "lucide-react";

import { useNavigate } from "react-router-dom";

const QuickActions = () => {
  const navigate = useNavigate();

  const actions = [
    {
      title: "Add Project",
      icon: Plus,
      color: "text-blue-600 bg-blue-100",
      action: () => navigate("/projects/add"),
    },
    {
      title: "Add Invoice",
      icon: FileText,
      color: "text-green-600 bg-green-100",
      action: () => navigate("/invoices"),
    },
    {
      title: "Add Expense",
      icon: Receipt,
      color: "text-yellow-600 bg-yellow-100",
      action: () => navigate("/expenses"),
    },
    {
      title: "Manage Resources",
      icon: Users,
      color: "text-purple-600 bg-purple-100",
      action: () => navigate("/resources"),
    },
    {
      title: "Generate Report",
      icon: BarChart3,
      color: "text-red-600 bg-red-100",
      action: () => navigate("/reports"),
    },
    {
      title: "Upload Document",
      icon: Upload,
      color: "text-cyan-600 bg-cyan-100",
      action: () => alert("Coming Soon"),
    },
    {
      title: "Export Dashboard",
      icon: Download,
      color: "text-blue-600 bg-blue-100",
      action: () => alert("Coming Soon"),
    },
  ];

  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-5">

      <h2 className="text-lg font-semibold text-slate-800 mb-5">
        Quick Actions
      </h2>

      <div className="flex flex-wrap gap-4">

        {actions.map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.title}
              onClick={item.action}
              className="
                flex
                items-center
                gap-3
                px-5
                py-3
                bg-white
                border
                border-gray-200
                rounded-xl
                shadow-sm
                hover:shadow-md
                hover:border-blue-300
                transition-all
                duration-300
                min-w-[175px]
              "
            >
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center ${item.color}`}
              >
                <Icon size={20} />
              </div>

              <span className="font-medium text-sm text-slate-700 whitespace-nowrap">
                {item.title}
              </span>
            </button>
          );
        })}

      </div>

    </div>
  );
};

export default QuickActions;