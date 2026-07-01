import type { Dispatch, SetStateAction } from "react";
import type { Project } from "../../../types/Project";
import { ExternalLink, FileText, CalendarDays } from "lucide-react";

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

        {/* Report Link */}

        <div>
          <label className="flex items-center gap-2 text-sm font-medium mb-2">
            <ExternalLink size={16} />
            Report Link
          </label>

          <input
            type="url"
            placeholder="https://example.com/report"
            value={project.reportLink}
            onChange={(e) =>
              setProject({
                ...project,
                reportLink: e.target.value,
              })
            }
            className="w-full border rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none"
          />

          {project.reportLink && (
            <a
              href={project.reportLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 text-sm hover:underline mt-2 inline-block"
            >
              Open Report
            </a>
          )}
        </div>

        {/* Completion Certificate */}

        <div>
          <label className="flex items-center gap-2 text-sm font-medium mb-2">
            <FileText size={16} />
            Completion Certificate
          </label>

          <input
            type="text"
            placeholder="Certificate Number / Document Link"
            value={project.completionCertificate}
            onChange={(e) =>
              setProject({
                ...project,
                completionCertificate: e.target.value,
              })
            }
            className="w-full border rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        {/* Completion Date */}

        <div>
          <label className="flex items-center gap-2 text-sm font-medium mb-2">
            <CalendarDays size={16} />
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
            className="w-full border rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

      </div>

    </div>
  );
};

export default DocumentCard;