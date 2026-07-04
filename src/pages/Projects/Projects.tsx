import { useNavigate } from "react-router-dom";
import { FolderKanban, Plus } from "lucide-react";

import ProjectTable from "../../components/Projects/ProjectTable";

const Projects = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">

      {/* Page Header */}

      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">

        <div className="flex justify-between items-center">

          {/* Left */}

          <div className="flex items-center gap-4">

            <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center">

              <FolderKanban
                size={28}
                className="text-blue-600"
              />

            </div>

            <div>

              <h1 className="text-3xl font-bold text-slate-800">
                Projects
              </h1>

              <p className="text-gray-500 mt-1">
                Manage engineering projects, commercial information and project lifecycle.
              </p>

            </div>

          </div>

          {/* Right */}

          <button
            onClick={() => navigate("/projects/add")}
            className="
              flex
              items-center
              gap-2
              bg-blue-600
              hover:bg-blue-700
              text-white
              font-medium
              px-5
              py-3
              rounded-xl
              shadow-sm
              transition-all
            "
          >
            <Plus size={18} />

            Add Project

          </button>

        </div>

      </div>

      {/* Table */}

      <ProjectTable />

    </div>
  );
};

export default Projects;