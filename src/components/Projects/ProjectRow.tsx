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

  return (
    <tr className="border-b hover:bg-slate-50">

      <td className="p-3">
        {project.prNo}
      </td>

      <td>
        {project.client}
      </td>

      <td>
        {project.projectTitle}
      </td>

      <td>
        {project.department}
      </td>

      <td>
        {project.projectStatus || "-"}
      </td>

      <td className="text-right">
        ₹{" "}
        {project.workOrderValue.toLocaleString("en-IN")}
      </td>

      {/* View */}
      <td className="text-center">
        <button
          type="button"
          title="View Project"
          onClick={() =>
            navigate(`/projects/view/${project.id}`)
          }
          className="text-blue-600 hover:text-blue-800 transition"
        >
          <Eye size={18} />
        </button>
      </td>

      {/* Edit */}
      <td className="text-center">
        <button
          type="button"
          title="Edit Project"
          onClick={() =>
            navigate(`/projects/edit/${project.id}`)
          }
          className="text-green-600 hover:text-green-800 transition"
        >
          <Pencil size={18} />
        </button>
      </td>

      {/* Delete */}
      <td className="text-center">
        <button
          type="button"
          title="Delete Project"
          onClick={() => onDelete(project.id)}
          className="text-red-600 hover:text-red-800 transition"
        >
          <Trash2 size={18} />
        </button>
      </td>

    </tr>
  );
};

export default ProjectRow;