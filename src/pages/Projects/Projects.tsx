import { useNavigate } from "react-router-dom";
import ProjectTable from "../../components/Projects/ProjectTable";

const Projects = () => {

  const navigate = useNavigate();

  return (
    <div className="space-y-6">

      <div className="flex justify-between items-center">

        <h1 className="text-4xl font-bold">
          Projects
        </h1>

        <button
          onClick={() => navigate("/projects/add")}
          className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700"
        >
          + Add Project
        </button>

      </div>

      <ProjectTable />

    </div>
  );
};

export default Projects;