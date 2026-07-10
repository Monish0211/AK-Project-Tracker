import { Save, RotateCcw, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Dispatch, SetStateAction } from "react";

import type { Project } from "../../../types/Project";

import {
  addProject,
  updateProject,
} from "../../../services/projectService";

import { createEmptyProject } from "../../../utils/createEmptyProject";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
  mode: "add" | "edit";
}

const FormButtons = ({
  project,
  setProject,
  mode,
}: Props) => {
  const navigate = useNavigate();

  const handleSave = () => {
    if (
      project.prNo.trim() === "" ||
      project.client.trim() === "" ||
      project.projectTitle.trim() === "" ||
      project.primaryProjectManager.trim() === ""
    ) {
      alert(
        "Please fill PR Number, Client, Project Title and Primary Project Manager."
      );
      return;
    }

    if (mode === "add") {
      addProject({
        ...project,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      alert("Project Saved Successfully!");
    } else {
      updateProject({
        ...project,
        updatedAt: new Date().toISOString(),
      });

      alert("Project Updated Successfully!");
    }

    navigate("/projects");
  };

  const handleReset = () => {
    if (
      !window.confirm(
        "Are you sure you want to reset the form?"
      )
    ) {
      return;
    }

    setProject(createEmptyProject());
  };

  const handleCancel = () => {
    if (
      window.confirm(
        "Are you sure you want to cancel?"
      )
    ) {
      navigate("/projects");
    }
  };

  return (
    <div className="flex justify-end gap-4 mt-8">

      <button
        type="button"
        onClick={handleReset}
        className="flex items-center gap-2 px-5 py-3 rounded-lg border border-yellow-500 text-yellow-600 hover:bg-yellow-50 transition"
      >
        <RotateCcw size={18} />
        Reset
      </button>

      <button
        type="button"
        onClick={handleCancel}
        className="flex items-center gap-2 px-5 py-3 rounded-lg border border-red-500 text-red-600 hover:bg-red-50 transition"
      >
        <X size={18} />
        Cancel
      </button>

      <button
        type="button"
        onClick={handleSave}
        className="flex items-center gap-2 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition save-project-btn"
      >
        <Save size={18} />
        {mode === "add"
          ? "Save Project"
          : "Update Project"}
      </button>

    </div>
  );
};

export default FormButtons;