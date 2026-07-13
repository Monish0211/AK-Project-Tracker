import { Clock3, ArrowRight } from "lucide-react";
import { getRecentProjects } from "../../../services/dashboardService";

const RecentProjects = () => {
  const projects = getRecentProjects();

  // Project Status (General Information) — never derived from invoices.
  const getStatusStyle = (status: string) => {
    switch (status) {
      case "Active":
        return {
          badge: "bg-blue-100 text-blue-700 border border-blue-200",
          dot: "bg-blue-500",
        };

      case "Completed":
        return {
          badge: "bg-green-100 text-green-700 border border-green-200",
          dot: "bg-green-500",
        };

      case "On Hold":
        return {
          badge: "bg-yellow-100 text-yellow-700 border border-yellow-200",
          dot: "bg-yellow-500",
        };

      case "Cancelled":
        return {
          badge: "bg-red-100 text-red-700 border border-red-200",
          dot: "bg-red-500",
        };

      default:
        return {
          badge: "bg-slate-100 text-slate-700 border border-slate-200",
          dot: "bg-slate-500",
        };
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 min-h-[420px] flex flex-col">

      {/* Header */}

      <div className="flex justify-between items-center px-6 py-5 border-b border-gray-100">

        <div className="flex items-center gap-3">

          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">

            <Clock3
              size={20}
              className="text-blue-600"
            />

          </div>

          <div>

            <h2 className="text-lg font-semibold text-slate-800">
              Recent Projects
            </h2>

            <p className="text-xs text-gray-500">
              Latest Project Entries
            </p>

          </div>

        </div>

        <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
          View All
        </button>

      </div>

      {/* Body */}

      <div className="flex-1 overflow-hidden px-6 py-4">

        {projects.length === 0 ? (

          <div className="h-full flex items-center justify-center text-gray-400">
            No Recent Projects
          </div>

        ) : (

          <table className="w-full table-fixed">

            <thead>

              <tr className="text-xs text-gray-500 border-b">

                <th className="w-16 text-left pb-3">
                  PR No
                </th>

                <th className="text-left pb-3">
                  Client
                </th>

                <th className="w-28 text-center pb-3">
                  Status
                </th>

                <th className="w-28 text-right pb-3">
                  WO Value
                </th>

              </tr>

            </thead>

            <tbody>

              {projects.map((project) => {
                const status = getStatusStyle(project.projectStatus);

                return (

                  <tr
                    key={project.id}
                    className="border-b last:border-none hover:bg-slate-50 transition"
                  >

                    <td className="py-4 text-sm font-medium text-slate-700">
                      {project.prNo}
                    </td>

                    <td className="py-4">

                      <div
                        className="truncate text-sm text-slate-700"
                        title={project.client}
                      >
                        {project.client}
                      </div>

                    </td>

                    <td className="text-center">

                      <span
                        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${status.badge}`}
                      >

                        <span
                          className={`w-2 h-2 rounded-full ${status.dot}`}
                        />

                        {project.projectStatus || "—"}

                      </span>

                    </td>

                    <td className="text-right text-sm font-semibold text-slate-800">

                      ₹{" "}
                      {project.workOrderValue.toLocaleString(
                        "en-IN"
                      )}

                    </td>

                  </tr>

                );
              })}

            </tbody>

          </table>

        )}

      </div>

      {/* Footer */}

      <div className="px-6 pb-5 mt-auto">

        <button
          className="
            w-full
            py-3
            rounded-xl
            bg-slate-50
            border
            border-gray-200
            text-blue-600
            font-medium
            hover:bg-blue-50
            transition
            flex
            items-center
            justify-center
            gap-2
          "
        >
          View All Projects

          <ArrowRight size={16} />

        </button>

      </div>

    </div>
  );
};

export default RecentProjects;