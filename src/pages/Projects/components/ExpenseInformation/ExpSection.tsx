import type { Dispatch, SetStateAction } from "react";

import type { Project } from "../../../../types/Project";

import NonManhourExpenseCard from "./NonManhourExpenseCard";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
}

const ExpSection = ({ project, setProject }: Props) => {
  return (
    <div className="space-y-6">
      <NonManhourExpenseCard project={project} setProject={setProject} />
    </div>
  );
};

export default ExpSection;
