import { Save, RotateCcw, X, ArrowLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Dispatch, SetStateAction } from "react";

import type { Project } from "../../../types/Project";
import { Button } from "../../../components/ui/Button";

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
  activeTab: _activeTab,
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
    <div className="sticky bottom-0 z-40 -mx-4 mt-2 bg-[var(--nu-surface)]/95 backdrop-blur-md border-t border-[var(--nu-border)] py-3 px-4 flex flex-wrap justify-between items-center gap-3 shadow-[var(--nu-shadow-md)] rounded-t-[var(--nu-radius-lg)]">
      {/* Left side actions */}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={<ArrowLeft size={14} />}
          onClick={handleBack}
        >
          Back
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={<RotateCcw size={14} />}
          onClick={handleReset}
          className="text-[var(--nu-warning)] hover:bg-[var(--nu-warning-soft)]"
        >
          Reset
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={<X size={14} />}
          onClick={handleCancel}
          className="text-[var(--nu-danger)] hover:bg-[var(--nu-danger-soft)]"
        >
          Cancel
        </Button>
      </div>

      {/* Right side actions */}
      <div className="flex flex-wrap gap-2">
        {!isLastTab && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={<ChevronRight size={14} />}
            onClick={handleSaveAndNext}
            className="flex-row-reverse"
          >
            Save & Next
          </Button>
        )}

        {isLastTab && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            icon={<Save size={14} />}
            onClick={handleSave}
            className="save-project-btn"
          >
            {mode === "add" ? "Save Project" : "Update Project"}
          </Button>
        )}
      </div>
    </div>
  );
};

export default FormButtons;
