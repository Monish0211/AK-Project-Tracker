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
  const [prCategory, setPrCategory] = useState("All");
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

  const prCategories = [
    "All",
    ...new Set(
      projects.map((p) => p.prCategory).filter(Boolean)
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
          .includes(search.toLowerCase());

      const matchesCategory =
        prCategory === "All" ||
        project.prCategory === prCategory;

      const matchesDepartment =
        department === "All" ||
        project.department === department;

      const matchesStatus =
        status === "All" ||
        project.projectStatus === status;

      return (
        matchesSearch &&
        matchesCategory &&
        matchesDepartment &&
        matchesStatus
      );
    });
  }, [
    projects,
    search,
    prCategory,
    department,
    status,
  ]);

  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100">

      {/* Header */}

      <div className="flex justify-between items-center p-6 border-b">

        <div className="flex items-center gap-3">

          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <FolderKanban
              size={20}
              className="text-blue-600"
            />
          </div>

          <div>
            <h2 className="text-xl font-semibold">
              Project Repository
            </h2>

            <p className="text-sm text-gray-500">
              Search and manage all projects
            </p>
          </div>

        </div>

        <span className="px-4 py-2 rounded-xl bg-blue-50 text-blue-700 font-medium">
          Total Projects : {filteredProjects.length}
        </span>

      </div>

      {/* Filters */}

      <div className="grid grid-cols-4 gap-4 p-6 border-b">

        {/* Search */}

        <div className="relative">

          <Search
            size={18}
            className="absolute left-3 top-3 text-gray-400"
          />

          <input
            type="text"
            placeholder="Search PR / Client / Project..."
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            className="w-full border rounded-xl pl-10 pr-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
          />

        </div>

        {/* PR Category */}

        <select
          value={prCategory}
          onChange={(e) =>
            setPrCategory(e.target.value)
          }
          className="border rounded-xl px-3 py-2"
        >
          {prCategories.map((category) => (
            <option
              key={category}
              value={category}
            >
              {category}
            </option>
          ))}
        </select>

        {/* Department */}

        <select
          value={department}
          onChange={(e) =>
            setDepartment(e.target.value)
          }
          className="border rounded-xl px-3 py-2"
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
          className="border rounded-xl px-3 py-2"
        >
          <option value="All">All Status</option>
          <option value="Active">Active</option>
          <option value="Completed">Completed</option>
          <option value="On Hold">On Hold</option>
          <option value="Cancelled">Cancelled</option>
        </select>

      </div>

      {/* Table */}

      {filteredProjects.length === 0 ? (
        <div className="py-16 text-center text-gray-500">
          No Projects Found
        </div>
      ) : (
        <div className="overflow-x-auto">

          <table className="min-w-full">

            <thead className="bg-slate-50 sticky top-0">

              <tr className="text-sm text-slate-700">

                <th className="px-4 py-4 text-left">
                  PR Category
                </th>

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
                  Department
                </th>

                <th className="px-4 py-4 text-center">
                  Status
                </th>

                <th className="px-4 py-4 text-right">
  WO Value
</th>

<th className="px-4 py-4 text-center">
  Next Payment
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