import { Save, RotateCcw, X, ArrowLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Dispatch, SetStateAction } from "react";

import type { Project } from "../../../types/Project";

import {
  addProject,
  updateProject,
  getProjectById,
} from "../../../services/projectService";

import { createEmptyProject } from "../../../utils/createEmptyProject";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
  mode: "add" | "edit";
  activeTab: string;
  /** When true, shows the Save / Update Project primary button. When false, only Save & Next is shown. */
  isLastTab: boolean;
  /** When true, Back exits to the Project Repository instead of going to the previous tab. */
  isFirstTab: boolean;
  /** Advances the form to the next tab. Called after the current tab's data is validated and saved. */
  onSaveAndNext: () => void;
  /** Moves the form to the previous tab. Not called when already on the first tab. */
  onBack: () => void;
}

const FormButtons = ({
  project,
  setProject,
  mode,
  activeTab,
  isLastTab,
  isFirstTab,
  onSaveAndNext,
  onBack,
}: Props) => {
  const navigate = useNavigate();

  const validate = (): boolean => {
    if (
      project.prNo.trim() === "" ||
      project.client.trim() === "" ||
      project.projectTitle.trim() === ""
    ) {
      alert("Please fill PR Number, Client, and Project Title.");
      return false;
    }

    const requiresManager =
      mode === "edit" && (
        isLastTab ||
        activeTab === "team" ||
        activeTab === "expenses" ||
        activeTab === "invoices"
      );

    if (requiresManager && project.primaryProjectManager.trim() === "") {
      alert("Please fill Primary Project Manager.");
      return false;
    }

    return true;
  };

  // Upserts by id so repeatedly saving while stepping through tabs in Add
  // Project never creates duplicate project records.
  const saveProjectData = () => {
    const timestamp = new Date().toISOString();
    const existing = getProjectById(project.id);

    if (existing) {
      updateProject({
        ...project,
        createdAt: existing.createdAt,
        updatedAt: timestamp,
      });
    } else {
      addProject({
        ...project,
        createdAt: project.createdAt || timestamp,
        updatedAt: timestamp,
      });
    }
  };

  const handleSave = () => {
    if (!validate()) return;
    saveProjectData();
    alert(mode === "add" ? "Project Saved Successfully!" : "Project Updated Successfully!");
    navigate("/projects");
  };

  const handleSaveAndNext = () => {
    if (!validate()) return;
    saveProjectData();
    onSaveAndNext();
  };

  const handleBack = () => {
    if (isFirstTab) {
      navigate("/projects");
    } else {
      onBack();
    }
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
    <div className="sticky bottom-0 bg-white/95 backdrop-blur-md border-t border-gray-200 py-4 px-6 flex justify-between items-center shadow-lg -mx-6 mt-8 z-40">

      {/* Left side actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-2 px-5 py-3 rounded-xl border border-gray-300 hover:bg-gray-50 text-slate-700 transition font-semibold"
        >
          <ArrowLeft size={18} />
          Back
        </button>

        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-2 px-5 py-3 rounded-xl border border-yellow-500 text-yellow-600 hover:bg-yellow-50 transition font-semibold"
        >
          <RotateCcw size={18} />
          Reset
        </button>

        <button
          type="button"
          onClick={handleCancel}
          className="flex items-center gap-2 px-5 py-3 rounded-xl border border-red-500 text-red-600 hover:bg-red-50 transition font-semibold"
        >
          <X size={18} />
          Cancel
        </button>
      </div>

      {/* Right side actions */}
      <div className="flex gap-3">
        {!isLastTab && (
          <button
            type="button"
            onClick={handleSaveAndNext}
            className="flex items-center gap-2 px-5 py-3 rounded-xl border border-blue-600 text-blue-600 hover:bg-blue-50 transition font-semibold"
          >
            Save & Next
            <ChevronRight size={18} />
          </button>
        )}

        {isLastTab && (
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition font-semibold save-project-btn shadow-md"
          >
            <Save size={18} />
            {mode === "add" ? "Save Project" : "Update Project"}
          </button>
        )}
      </div>

    </div>
  );
};

export default FormButtons;