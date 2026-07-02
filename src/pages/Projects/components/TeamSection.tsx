import type { Project } from "../../../types/Project";
import InfoField from "./InfoField";
import InfoSection from "./InfoSection";

interface Props {
  project: Project;
}

const TeamSection = ({ project }: Props) => {
  return (
    <InfoSection title="Project Team Information">
      <InfoField
        label="Project Manager"
        value={project.projectManager}
      />

      <InfoField
        label="Project Engineer"
        value={project.projectEngineer}
      />

      <InfoField
        label="Project Coordinator"
        value={project.projectCoordinator}
      />

      <InfoField
        label="Client Reference No"
        value={project.clientReferenceNo}
      />

      <InfoField
        label="Remarks"
        value={project.remarks}
      />
    </InfoSection>
  );
};

export default TeamSection;