import { Eye, Pencil, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import type { Project } from "../../types/Project";
import { getProjectCommercialSummary } from "../../services/invoiceProgressService";

interface Props {
  project: Project;
  onDelete: (id: string) => void;
}

const ProjectRow = ({
  project,
  onDelete,
}: Props) => {
  const navigate = useNavigate();

  const {
    invoiceStatus,
    pendingDue,
  } = getProjectCommercialSummary(project);

  // Project Status (General Information) — operational status, never derived from invoices.
  const getProjectStatusStyle = (status: string) => {
    switch (status) {
      case "Active":
        return "bg-blue-100 text-blue-700";

      case "Completed":
        return "bg-green-100 text-green-700";

      case "On Hold":
        return "bg-yellow-100 text-yellow-700";

      case "Cancelled":
        return "bg-red-100 text-red-700";

      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  // Invoice Status (Invoice History) — commercial/billing status, independent of Project Status.
  const getInvoiceStatusStyle = (status: string) => {
    switch (status) {
      case "Not Started":
        return "bg-red-100 text-red-700";

      case "Pending":
        return "bg-orange-100 text-orange-700";

      case "Completed":
        return "bg-green-100 text-green-700";

      default:
        return "bg-slate-100 text-slate-700";
    }
  };


  return (
    <tr className="border-b hover:bg-slate-50 transition">

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

      {/* Status (General Information → Project Status) */}
      <td className="px-4 py-4 text-center">
        <span
          className={`px-3 py-1 rounded-full text-xs font-semibold ${getProjectStatusStyle(
            project.projectStatus
          )}`}
        >
          {project.projectStatus || "—"}
        </span>
      </td>

      {/* Invoice Status (Invoice History) */}
      <td className="px-4 py-4 text-center">
        <span
          className={`px-3 py-1 rounded-full text-xs font-semibold ${getInvoiceStatusStyle(
            invoiceStatus
          )}`}
        >
          {invoiceStatus}
        </span>
      </td>

      {/* WO Value */}
      <td className="px-4 py-4 text-right font-semibold whitespace-nowrap">
        ₹ {project.workOrderValueINR.toLocaleString("en-IN")}
      </td>

      {/* Pending Due (Invoice History: Project Value − Invoice Raised) */}
      <td className={`px-4 py-4 text-right whitespace-nowrap font-semibold ${
        pendingDue === 0 ? "text-green-600" : "text-orange-600"
      }`}>
        ₹ {pendingDue.toLocaleString("en-IN")}
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