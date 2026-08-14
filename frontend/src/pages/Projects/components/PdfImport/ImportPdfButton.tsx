import { useState } from "react";
import { FileUp } from "lucide-react";
import type { Project } from "../../../../types/Project";
import { Button } from "../../../../components/ui/Button";
import { ImportPdfModal } from "./ImportPdfModal";

interface Props {
  project: Project;
  onApply: (updatedProject: Project) => void;
}

/**
 * Self-contained — owns its own open/close state so AddProject.tsx only
 * ever adds one line (`<ImportPdfButton project={project} onApply={setProject} />`)
 * with no extra state of its own to manage.
 */
export const ImportPdfButton = ({ project, onApply }: Props) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="primary" size="sm" icon={<FileUp size={14} />} onClick={() => setIsOpen(true)}>
        Import Project from PDF
      </Button>
      <ImportPdfModal isOpen={isOpen} onClose={() => setIsOpen(false)} project={project} onApply={onApply} />
    </>
  );
};

export default ImportPdfButton;
