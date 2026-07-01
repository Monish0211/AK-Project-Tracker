import type { Dispatch, SetStateAction } from "react";
import type { Project } from "../../../types/Project";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
}

const FormButtons = ({ project }: Props) => {

  const handleSave = () => {
    console.log(project);
    alert("Project Saved Successfully!");
  };

  return (
    <div className="flex justify-end gap-4">

      <button
        type="button"
        className="px-6 py-3 rounded-lg border"
      >
        Cancel
      </button>

      <button
        type="button"
        onClick={handleSave}
        className="px-6 py-3 rounded-lg bg-blue-600 text-white"
      >
        Save Project
      </button>

    </div>
  );
};

export default FormButtons;