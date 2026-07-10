import { useState } from "react";
import type { Project } from "../../types/Project";
import { createEmptyProject } from "../../utils/createEmptyProject";
import ProjectForm from "./components/ProjectForm";

const AddProject = () => {
  const [project, setProject] = useState<Project>(createEmptyProject());

  return (
    <ProjectForm project={project} setProject={setProject} mode="add" />
  );
};

export default AddProject;