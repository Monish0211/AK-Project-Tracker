import { useMemo, useState } from "react";
import {
  Search,
  FolderKanban,
} from "lucide-react";

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

  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("All");
  const [status, setStatus] = useState("All");

  const handleDelete = (id: string) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this project?"
      )
    )
      return;

    deleteProject(id);

    setProjects(getProjects());
  };

  const departments = [
    "All",
    ...new Set(
      projects.map((p) => p.department).filter(Boolean)
    ),
  ];

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const matchesSearch =
        project.prNo
          ?.toLowerCase()
          .includes(search.toLowerCase()) ||
        project.client
          ?.toLowerCase()
          .includes(search.toLowerCase()) ||
        project.projectTitle
          ?.toLowerCase()
          .includes(search.toLowerCase()) ||
        project.primaryProjectManager
          ?.toLowerCase()
          .includes(search.toLowerCase());

      const matchesDepartment =
        department === "All" ||
        project.department === department;

      const matchesStatus =
        status === "All" ||
        project.projectStatus === status;

      return (
        matchesSearch &&
        matchesDepartment &&
        matchesStatus
      );
    });
  }, [
    projects,
    search,
    department,
    status,
  ]);

  return (
    <div className="bg-white dark:bg-[#1E293B] rounded-2xl shadow-md border border-gray-100 dark:border-slate-800">

      {/* Header */}

      <div className="flex justify-between items-center p-6 border-b border-[var(--nu-border)]">

        <div className="flex items-center gap-3">

          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
            <FolderKanban
              size={20}
              className="text-blue-600 dark:text-blue-400"
            />
          </div>

          <div>
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
              Project Repository
            </h2>

            <p className="text-sm text-gray-500 dark:text-slate-400">
              Search and manage all projects
            </p>
          </div>

        </div>

        <span className="px-4 py-2 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">
          Total Projects : {filteredProjects.length}
        </span>

      </div>

      {/* Filters */}

      <div className="grid grid-cols-3 gap-4 p-6 border-b border-[var(--nu-border)]">

        {/* Search */}

        <div className="relative">

          <Search
            size={18}
            className="absolute left-3 top-3 text-gray-400 dark:text-slate-500"
          />

          <input
            type="text"
            placeholder="Search PR / Client / Project..."
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            className="w-full border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 rounded-xl pl-10 pr-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
          />

        </div>

        {/* Department */}

        <select
          value={department}
          onChange={(e) =>
            setDepartment(e.target.value)
          }
          className="border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 rounded-xl px-3 py-2 outline-none"
        >
          {departments.map((dept) => (
            <option
              key={dept}
              value={dept}
            >
              {dept}
            </option>
          ))}
        </select>

        {/* Status */}

        <select
          value={status}
          onChange={(e) =>
            setStatus(e.target.value)
          }
          className="border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 rounded-xl px-3 py-2 outline-none"
        >
          <option value="All">All Status</option>
          <option value="Active">Active</option>
          <option value="On Hold">On Hold</option>
          <option value="Completed">Completed</option>
          <option value="Cancelled">Cancelled</option>
        </select>

      </div>

      {/* Table */}

      {filteredProjects.length === 0 ? (
        <div className="py-16 text-center text-gray-500 dark:text-slate-400">
          No Projects Found
        </div>
      ) : (
        <div className="overflow-x-auto">

          <table className="min-w-full">

            <thead className="bg-slate-50 dark:bg-slate-900/80 sticky top-0 border-b border-[var(--nu-border)]">

              <tr className="text-sm text-slate-700 dark:text-slate-300">

                <th className="px-4 py-4 text-left">
                  PR No
                </th>

                <th className="px-4 py-4 text-left">
                  Client
                </th>

                <th className="px-4 py-4 text-left">
                  Project Title
                </th>

                <th className="px-4 py-4 text-left">
                  Primary Manager
                </th>

                <th className="px-4 py-4 text-left">
                  Department
                </th>

                <th className="px-4 py-4 text-center">
                  Project Status
                </th>

                <th className="px-4 py-4 text-center">
                  Invoice Status
                </th>

                <th className="px-4 py-4 text-right">
                  WO Value
                </th>

                <th className="px-4 py-4 text-right">
                  Pending Due
                </th>

<th className="px-4 py-4 text-center">
  Actions
</th>
    

              </tr>

            </thead>

            <tbody>

              {filteredProjects.map((project) => (

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