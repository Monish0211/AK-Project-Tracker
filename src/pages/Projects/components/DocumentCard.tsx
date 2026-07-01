import type { Dispatch, SetStateAction } from "react";
import type { Project } from "../../../types/Project";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
}

const DocumentCard = ({ project, setProject }: Props) => {
  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <h2 className="text-2xl font-semibold mb-6">
        Document Information
      </h2>

      <div className="grid grid-cols-2 gap-6">

        <div>
          <label className="block text-sm font-medium mb-2">
            Report Link
          </label>

          <input
            type="text"
            value={project.reportLink}
            onChange={(e) =>
              setProject({
                ...project,
                reportLink: e.target.value,
              })
            }
            className="w-full border rounded-lg p-3"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Completion Certificate
          </label>

          <input
            type="text"
            value={project.completionCertificate}
            onChange={(e) =>
              setProject({
                ...project,
                completionCertificate: e.target.value,
              })
            }
            className="w-full border rounded-lg p-3"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Project Completion Date
          </label>

          <input
            type="date"
            value={project.projectCompletionDate}
            onChange={(e) =>
              setProject({
                ...project,
                projectCompletionDate: e.target.value,
              })
            }
            className="w-full border rounded-lg p-3"
          />
        </div>

      </div>
    </div>
  );
};

export default DocumentCard;