import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { Project } from "../../types/Project";
import { getProjectById } from "../../services/projectService";
import { createEmptyProject } from "../../utils/createEmptyProject";
import ProjectForm from "./components/ProjectForm";
import type { TabKey } from "./components/ProjectForm";

const EditProject = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();

  const initialTab = (location.state as { tab?: TabKey } | null)?.tab;

  const existingProject = id ? getProjectById(id) : undefined;

  const [project, setProject] = useState<Project>(
    existingProject ?? createEmptyProject()
  );

  useEffect(() => {
    if (existingProject) {
      setProject(existingProject);
    }
  }, [id]);

  if (!existingProject) {
    return (
      <div className="bg-white rounded-xl shadow-md p-8 text-center mt-10">
        <h1 className="text-3xl font-bold text-red-600 mb-4">
          Project Not Found
        </h1>

        <button
          type="button"
          onClick={() => navigate("/projects")}
          className="px-5 py-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
        >
          Back to Projects
        </button>
      </div>
    );
  }

  return (
    <ProjectForm
      project={project}
      setProject={setProject}
      mode="edit"
      initialTab={initialTab}
    />
  );
};

export default EditProject;