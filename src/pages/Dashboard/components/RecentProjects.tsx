import { Clock3 } from "lucide-react";

import { getRecentProjects } from "../../../services/dashboardService";

const RecentProjects = () => {
  const projects = getRecentProjects();

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Completed":
        return "bg-green-100 text-green-700";

      case "Active":
        return "bg-blue-100 text-blue-700";

      case "On Hold":
        return "bg-yellow-100 text-yellow-700";

      case "Cancelled":
        return "bg-red-100 text-red-700";

      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-md p-6">

      <div className="flex justify-between items-center mb-6">

        <h2 className="text-xl font-semibold">
          Recent Projects
        </h2>

        <Clock3
          size={22}
          className="text-blue-600"
        />

      </div>

      {projects.length === 0 ? (

        <div className="h-64 flex items-center justify-center text-gray-500">
          No Projects Available
        </div>

      ) : (

        <div className="overflow-x-auto">

          <table className="w-full">

            <thead>

              <tr className="border-b text-gray-500 text-sm">

                <th className="text-left pb-3">
                  PR No
                </th>

                <th className="text-left pb-3">
                  Client
                </th>

                <th className="text-left pb-3">
                  Status
                </th>

                <th className="text-right pb-3">
                  WO Value
                </th>

              </tr>

            </thead>

            <tbody>

              {projects.map((project) => (

                <tr
                  key={project.id}
                  className="border-b last:border-none hover:bg-slate-50"
                >

                  <td className="py-4">
                    {project.prNo}
                  </td>

                  <td>
                    {project.client}
                  </td>

                  <td>

                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                        project.projectStatus
                      )}`}
                    >
                      {project.projectStatus || "N/A"}
                    </span>

                  </td>

                  <td className="text-right font-semibold text-green-700">
                    ₹{" "}
                    {project.workOrderValue.toLocaleString(
                      "en-IN"
                    )}
                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      )}

      <button
        className="
          w-full
          mt-6
          py-2
          rounded-xl
          bg-blue-50
          text-blue-600
          font-semibold
          hover:bg-blue-100
          transition
        "
      >
        View All Projects →
      </button>

    </div>
  );
};

export default RecentProjects;