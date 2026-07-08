import type { Dispatch, SetStateAction } from "react";

import type { Project } from "../../../../types/Project";

import ManhourExpenseCard from "./ManhourExpenseCard";
import NonManhourExpenseCard from "./NonManhourExpenseCard";
import CostSummaryCard from "./CostSummaryCard";
import ProfitAnalysisCard from "./ProfitAnalysisCard";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
}

const ExpSection = ({ project, setProject }: Props) => {
  return (
    <div className="space-y-6">

      <ManhourExpenseCard project={project} setProject={setProject} />

      <NonManhourExpenseCard project={project} setProject={setProject} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        <CostSummaryCard
          manhourExpenses={project.manhourExpenses}
          nonManhourExpenses={project.nonManhourExpenses}
        />

        <ProfitAnalysisCard
          manhourExpenses={project.manhourExpenses}
          nonManhourExpenses={project.nonManhourExpenses}
          revenue={project.workOrderValue}
        />

      </div>

    </div>
  );
};

export default ExpSection;
