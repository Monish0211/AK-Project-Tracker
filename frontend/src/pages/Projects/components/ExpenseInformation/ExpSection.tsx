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
      {/* Dead/unused component (ExpSection itself is never imported anywhere
          in the app — Other Project Expenses actually renders via
          ProjectForm.tsx -> NonManhourExpenseCard directly, with real
          removedExpenseIds tracking there). onExpenseRemoved is a no-op
          here only to satisfy the type checker for this unreachable file. */}
      <NonManhourExpenseCard project={project} setProject={setProject} onExpenseRemoved={() => {}} />
    </div>
  );
};

export default ExpSection;
