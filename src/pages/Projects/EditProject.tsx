import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { Project } from "../../types/Project";
import { getProjectById, normalizeProject } from "../../services/projectService";
import { createEmptyProject } from "../../utils/createEmptyProject";
import ProjectForm from "./components/ProjectForm";
import type { TabKey } from "./components/ProjectForm";
import { Button } from "../../components/ui/Button";

const EditProject = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();

  const initialTab = (location.state as { tab?: TabKey } | null)?.tab;

  const existingProject = id ? getProjectById(id) : undefined;

  const [project, setProject] = useState<Project>(() =>
    existingProject ? normalizeProject(existingProject) : createEmptyProject()
  );

  useEffect(() => {
    if (existingProject) {
      setProject(normalizeProject(existingProject));
    }
  }, [id]);

  if (!existingProject) {
    return (
      <div className="bg-white rounded-xl shadow-md p-8 text-center mt-10">
        <h1 className="text-3xl font-bold text-red-600 mb-4">
          Project Not Found
        </h1>

        <Button variant="primary" type="button" onClick={() => navigate("/projects")}>
          Back to Projects
        </Button>
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