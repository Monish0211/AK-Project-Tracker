import { useState } from "react";

import type { Project } from "../../types/Project";

import {
  getProjects,
  deleteProject,
} from "../../services/projectService";

import ProjectRow from "./ProjectRow";

const ProjectTable = () => {
  const [projects, setProjects] = useState<Project[]>(
    getProjects()
  );

  console.log("Projects from LocalStorage:", projects);

  const handleDelete = (id: string) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this project?"
    );

    if (!confirmDelete) return;

    deleteProject(id);

    setProjects(getProjects());

    alert("Project deleted successfully!");
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold">
          Projects
        </h2>

        <span className="text-sm text-gray-500">
          Total Projects: {projects.filter(Boolean).length}
        </span>
      </div>

      {projects.filter(Boolean).length === 0 ? (
        <div className="text-center py-10 text-gray-500">
          No Projects Found
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border border-gray-200">
            <thead className="bg-slate-100">
              <tr>
                <th className="border p-3 text-left">
                  PR No
                </th>

                <th className="border p-3 text-left">
                  Client
                </th>

                <th className="border p-3 text-left">
                  Project Title
                </th>

                <th className="border p-3 text-left">
                  Department
                </th>

                <th className="border p-3 text-left">
                  Status
                </th>

                <th className="border p-3 text-right">
                  WO Value
                </th>

                <th className="border p-3 text-center">
                  View
                </th>

                <th className="border p-3 text-center">
                  Edit
                </th>

                <th className="border p-3 text-center">
                  Delete
                </th>
              </tr>
            </thead>

            <tbody>
              {projects
                .filter(
                  (project): project is Project =>
                    project !== undefined &&
                    project !== null
                )
                .map((project) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    onDelete={handleDelete}
                  />
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ProjectTable;