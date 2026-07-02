import { Building2 } from "lucide-react";
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

  return (
    <div className="bg-white rounded-2xl shadow-md p-6">

      <div className="flex justify-between items-center mb-6">

        <h2 className="text-xl font-semibold">
          Department Summary
        </h2>

        <Building2
          className="text-blue-600"
          size={22}
        />

      </div>

      {departments.length === 0 ? (

        <div className="h-64 flex items-center justify-center text-gray-500">
          No Department Data
        </div>

      ) : (

        <div className="space-y-5">

          {departments.map((dept, index) => (

            <div key={dept.department}>

              <div className="flex justify-between mb-2">

                <span className="font-medium text-gray-700">
                  {dept.department}
                </span>

                <span className="font-semibold">
                  {dept.count}
                </span>

              </div>

              <div className="h-3 bg-gray-200 rounded-full overflow-hidden">

                <div
                  className={`h-3 rounded-full ${
                    COLORS[index % COLORS.length]
                  }`}
                  style={{
                    width: `${Math.min(
                      dept.count * 15,
                      100
                    )}%`,
                  }}
                />

              </div>

            </div>

          ))}

        </div>

      )}

      <button
        className="
          w-full
          mt-8
          py-2
          rounded-xl
          bg-blue-50
          text-blue-600
          font-semibold
          hover:bg-blue-100
        "
      >
        View All Departments →
      </button>

    </div>
  );
};

export default DepartmentSummary;