import { useState } from "react";
import type { Project } from "../../types/Project";
import { createEmptyProject } from "../../utils/createEmptyProject";
import ProjectForm from "./components/ProjectForm";
import { ImportPdfButton } from "./components/PdfImport/ImportPdfButton";
import { useCountryLock } from "../../auth/useCountryLock";

// A new project's country comes from the PR Category the user picks in the form, never from the selector. Switching the selector here would remount the page and discard
// the form, so it stays where it is until the project is saved or the page is left.
const ADD_LOCK_REASON = "Locked while you add a project: its country comes from the PR Category you choose.";

const AddProject = () => {
  useCountryLock(ADD_LOCK_REASON);
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
