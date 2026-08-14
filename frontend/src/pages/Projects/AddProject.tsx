import { useState } from "react";
import type { Project } from "../../types/Project";
import { createEmptyProject } from "../../utils/createEmptyProject";
import ProjectForm from "./components/ProjectForm";
import { ImportPdfButton } from "./components/PdfImport/ImportPdfButton";

const AddProject = () => {
  const [project, setProject] = useState<Project>(createEmptyProject());

  return (
    <>
      {/* Sibling to ProjectForm, not a wrapper — ProjectForm's own root div
          relies on a negative margin relative to the page's real layout
          container, which a new wrapping element here would disturb. */}
      <div className="flex justify-end mb-3">
        <ImportPdfButton project={project} onApply={setProject} />
      </div>
      <ProjectForm project={project} setProject={setProject} mode="add" />
    </>
  );
};

export default AddProject;
