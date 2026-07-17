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

  const [project, setProject] = useState<Project>(createEmptyProject());

  // Load project from localStorage - always get the latest data
  useEffect(() => {
    if (id) {
      const latest = getProjectById(id);
      if (latest) {
        setProject(latest);
      }
    }
  }, [id]);

  // Refresh project data periodically to catch timesheet syncs
  useEffect(() => {
    const interval = setInterval(() => {
      if (id) {
        const latest = getProjectById(id);
        if (latest) {
          setProject(latest);
        }
      }
    }, 2000); // Refresh every 2 seconds

    return () => clearInterval(interval);
  }, [id]);

  const existingProject = id ? getProjectById(id) : undefined;

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