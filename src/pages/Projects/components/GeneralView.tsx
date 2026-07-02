import type { Project } from "../../../types/Project";
import InfoField from "./InfoField";
import InfoSection from "./InfoSection";

interface Props {
  project: Project;
}

const GeneralView = ({ project }: Props) => {
  return (
    <InfoSection title="General Information">
      <InfoField
        label="PO Month"
        value={project.poMonth}
      />

      <InfoField
        label="PR Number"
        value={project.prNo}
      />

      <InfoField
        label="Client"
        value={project.client}
      />

      <InfoField
        label="Department"
        value={project.department}
      />

      <InfoField
        label="Domestic / Foreign"
        value={project.domesticForeign}
      />

      <InfoField
        label="Project Title"
        value={project.projectTitle}
      />

      <InfoField
        label="Work Order Status"
        value={project.workOrderStatus}
      />

      <InfoField
        label="Project Start Date"
        value={project.projectStartDate}
      />

      <InfoField
        label="Project End Date"
        value={project.projectEndDate}
      />

      <InfoField
        label="Project Status"
        value={project.projectStatus}
      />
    </InfoSection>
  );
};

export default GeneralView;