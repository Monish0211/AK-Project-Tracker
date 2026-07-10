import { Eye, Pencil, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import type { Project } from "../../types/Project";
import { getNextPayment } from "../../utils/paymentUtils";

interface Props {
  project: Project;
  onDelete: (id: string) => void;
}

const ProjectRow = ({
  project,
  onDelete,
}: Props) => {
  const navigate = useNavigate();

  const nextPayment = getNextPayment(project);

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "Active":
        return "bg-blue-100 text-blue-700";

      case "Completed":
        return "bg-green-100 text-green-700";

      case "On Hold":
        return "bg-yellow-100 text-yellow-700";

      case "In Progress":
        return "bg-purple-100 text-purple-700";

      case "Cancelled":
        return "bg-red-100 text-red-700";

      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getCategoryStyle = (category: string) => {
    switch (category) {
      case "India":
        return "bg-blue-100 text-blue-700";

      case "Malaysia":
        return "bg-green-100 text-green-700";

      case "Oman":
        return "bg-orange-100 text-orange-700";

      case "Abu Dhabi":
        return "bg-purple-100 text-purple-700";

      case "FZI":
        return "bg-cyan-100 text-cyan-700";

      case "Elixir Qatar":
        return "bg-pink-100 text-pink-700";

      case "Qatar":
        return "bg-indigo-100 text-indigo-700";

      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getPaymentStatusStyle = (status: string) => {
    switch (status) {
      case "Upcoming":
        return "text-green-600";

      case "Today":
        return "text-orange-600";

      case "Overdue":
        return "text-red-600";

      default:
        return "text-gray-500";
    }
  };

  const formatDue = () => {
    if (!nextPayment) return "-";

    return new Date(nextPayment.dueDate).toLocaleDateString(
      "en-IN",
      {
        day: "2-digit",
        month: "short",
      }
    );
  };

  const formatDays = () => {
    if (!nextPayment) return "-";

    if (nextPayment.status === "Today")
      return "Today";

    if (nextPayment.status === "Upcoming")
      return `${nextPayment.daysLeft} Days`;

    return `${Math.abs(nextPayment.daysLeft)} Overdue`;
  };

  return (
    <tr className="border-b hover:bg-slate-50 transition">

      {/* PR Category */}
      <td className="px-4 py-4 whitespace-nowrap">
        <span
          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${getCategoryStyle(
            project.prCategory
          )}`}
        >
          {project.prCategory || "-"}
        </span>
      </td>

      {/* PR No */}
      <td className="px-4 py-4 font-medium whitespace-nowrap">
        {project.prNo}
      </td>

      {/* Client */}
      <td className="px-4 py-4 max-w-[180px]">
        <div className="truncate">
          {project.client}
        </div>
      </td>

      {/* Project */}
      <td className="px-4 py-4 max-w-[280px]">
        <div className="truncate">
          {project.projectTitle}
        </div>
      </td>

      {/* Primary Manager */}
      <td className="px-4 py-4 max-w-[150px]">
        <div className="truncate">
          {project.primaryProjectManager || "--"}
        </div>
      </td>

      {/* Department */}
      <td className="px-4 py-4">
        {project.department}
      </td>

      {/* Status */}
      <td className="px-4 py-4 text-center">
        <span
          className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusStyle(
            project.projectStatus
          )}`}
        >
          {project.projectStatus}
        </span>
      </td>

      {/* WO Value */}
      <td className="px-4 py-4 text-right font-semibold whitespace-nowrap">
        ₹ {project.workOrderValue.toLocaleString("en-IN")}
      </td>

      {/* Next Payment */}
      <td className="px-4 py-4 text-center whitespace-nowrap">
        {nextPayment ? (
          <div>
            <div className="font-medium">
              {formatDue()}
            </div>

            <div
              className={`text-xs font-medium ${getPaymentStatusStyle(
                nextPayment.status
              )}`}
            >
              {formatDays()}
            </div>
          </div>
        ) : (
          "-"
        )}
      </td>

      {/* Pending Due */}
      <td className="px-4 py-4 text-right whitespace-nowrap">
        {nextPayment
          ? `₹ ${nextPayment.amount.toLocaleString("en-IN")}`
          : "-"}
      </td>

      {/* Actions */}
      <td className="px-4 py-4">
        <div className="flex justify-center gap-2">

          <button
            title="View"
            onClick={() =>
              navigate(`/projects/view/${project.id}`)
            }
            className="w-9 h-9 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 flex items-center justify-center"
          >
            <Eye size={18} />
          </button>

          <button
            title="Edit"
            onClick={() =>
              navigate(`/projects/edit/${project.id}`)
            }
            className="w-9 h-9 rounded-lg bg-green-50 hover:bg-green-100 text-green-600 flex items-center justify-center"
          >
            <Pencil size={18} />
          </button>

          <button
            title="Delete"
            onClick={() => onDelete(project.id)}
            className="w-9 h-9 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center"
          >
            <Trash2 size={18} />
          </button>

        </div>
      </td>

    </tr>
  );
};

export default ProjectRow;