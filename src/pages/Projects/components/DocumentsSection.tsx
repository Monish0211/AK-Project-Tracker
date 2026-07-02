import type { Project } from "../../../types/Project";
import InfoField from "./InfoField";
import InfoSection from "./InfoSection";

interface Props {
  project: Project;
}

const DocumentsSection = ({ project }: Props) => {
  return (
    <InfoSection title="Document Information">
      <InfoField
        label="Report Link"
        value={project.reportLink || "-"}
      />

      <InfoField
        label="Completion Certificate"
        value={project.completionCertificate || "-"}
      />

      <InfoField
        label="Project Completion Date"
        value={project.projectCompletionDate || "-"}
      />
    </InfoSection>
  );
};

export default DocumentsSection;