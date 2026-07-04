import { Eye, Pencil, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import type { Project } from "../../types/Project";

interface Props {
  project: Project;
  onDelete: (id: string) => void;
}

const ProjectRow = ({
  project,
  onDelete,
}: Props) => {
  const navigate = useNavigate();

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

  return (
    <tr className="border-b hover:bg-slate-50 transition">

      {/* PR No */}
      <td className="px-4 py-4 font-medium text-slate-700 whitespace-nowrap">
        {project.prNo}
      </td>

      {/* Client */}
      <td className="px-4 py-4 max-w-[180px]">

        <div
          className="truncate text-slate-700"
          title={project.client}
        >
          {project.client}
        </div>

      </td>

      {/* Project Title */}
      <td className="px-4 py-4 max-w-[320px]">

        <div
          className="truncate text-slate-700"
          title={project.projectTitle}
        >
          {project.projectTitle}
        </div>

      </td>

      {/* Department */}
      <td className="px-4 py-4 max-w-[160px]">

        <div
          className="truncate"
          title={project.department}
        >
          {project.department}
        </div>

      </td>

      {/* Status */}
      <td className="px-4 py-4 text-center">

        <span
          className={`
            inline-flex
            items-center
            px-3
            py-1
            rounded-full
            text-xs
            font-semibold
            ${getStatusStyle(project.projectStatus)}
          `}
        >
          {project.projectStatus || "-"}
        </span>

      </td>

      {/* WO Value */}
      <td className="px-4 py-4 text-right font-semibold text-slate-800 whitespace-nowrap">

        ₹{" "}
        {project.workOrderValue.toLocaleString(
          "en-IN"
        )}

      </td>

      {/* Actions */}
      <td className="px-4 py-4">

        <div className="flex justify-center gap-2">

          {/* View */}
          <button
            title="View"
            onClick={() =>
              navigate(`/projects/view/${project.id}`)
            }
            className="
              w-9
              h-9
              rounded-lg
              bg-blue-50
              hover:bg-blue-100
              text-blue-600
              flex
              items-center
              justify-center
              transition
            "
          >
            <Eye size={18} />
          </button>

          {/* Edit */}
          <button
            title="Edit"
            onClick={() =>
              navigate(`/projects/edit/${project.id}`)
            }
            className="
              w-9
              h-9
              rounded-lg
              bg-green-50
              hover:bg-green-100
              text-green-600
              flex
              items-center
              justify-center
              transition
            "
          >
            <Pencil size={18} />
          </button>

          {/* Delete */}
          <button
            title="Delete"
            onClick={() => onDelete(project.id)}
            className="
              w-9
              h-9
              rounded-lg
              bg-red-50
              hover:bg-red-100
              text-red-600
              flex
              items-center
              justify-center
              transition
            "
          >
            <Trash2 size={18} />
          </button>

        </div>

      </td>

    </tr>
  );
};

export default ProjectRow;