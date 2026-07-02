import { Building2, ChevronDown } from "lucide-react";
import { getDepartmentSummary } from "../../../services/dashboardService";

const COLORS = [
  "bg-blue-500",
  "bg-green-500",
  "bg-purple-500",
  "bg-orange-500",
  "bg-red-500",
  "bg-cyan-500",
];

const DepartmentSummary = () => {
  const departments = getDepartmentSummary();

  const maxCount = Math.max(
    ...departments.map((dept) => dept.count),
    1
  );

  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 min-h-[420px] flex flex-col">

      {/* Header */}
      <div className="flex justify-between items-center px-6 py-5 border-b border-gray-100">

        <div className="flex items-center gap-3">

          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">

            <Building2
              size={20}
              className="text-blue-600"
            />

          </div>

          <div>

            <h2 className="text-lg font-semibold text-slate-800">
              Department Summary
            </h2>

            <p className="text-xs text-gray-500">
              Projects by Department
            </p>

          </div>

        </div>

        <button
          className="
            flex
            items-center
            gap-1
            px-3
            py-1.5
            text-xs
            border
            border-gray-200
            rounded-lg
            hover:bg-gray-50
            transition
          "
        >
          By Projects

          <ChevronDown size={14} />

        </button>

      </div>

      {/* Body */}
      <div className="flex-1 px-6 py-5">

        {departments.length === 0 ? (

          <div className="h-full flex items-center justify-center text-gray-400">
            No Department Data
          </div>

        ) : (

          <div className="space-y-6">

            {departments.map((dept, index) => (

              <div key={dept.department}>

                <div className="flex justify-between items-center mb-2">

                  <div className="flex items-center gap-3">

                    <div
                      className={`w-3 h-3 rounded-full ${
                        COLORS[index % COLORS.length]
                      }`}
                    />

                    <span className="text-sm font-medium text-slate-700">
                      {dept.department}
                    </span>

                  </div>

                  <span className="text-sm font-semibold text-slate-700">
                    {dept.count}
                  </span>

                </div>

                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">

                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${
                      COLORS[index % COLORS.length]
                    }`}
                    style={{
                      width: `${
                        (dept.count / maxCount) * 100
                      }%`,
                    }}
                  />

                </div>

              </div>

            ))}

          </div>

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
          "
        >
          View All Departments
        </button>

      </div>

    </div>
  );
};

export default DepartmentSummary;