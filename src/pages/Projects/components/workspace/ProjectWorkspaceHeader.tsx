import { FileText, Pencil, Printer, Share2, StickyNote } from "lucide-react";
import type { Project } from "../../../../types/Project";
import { Badge } from "../../../../components/ui/Badge";
import { statusTone } from "../../../../components/ui/statusTone";
import { Button } from "../../../../components/ui/Button";
import ProjectHealthRing from "./ProjectHealthRing";
import { getProjectHealthStatus } from "./getProjectHealthStatus";

interface Props {
  project: Project;
  progressPercent: number;
  profitMargin: number;
  hasRevenue: boolean;
  pendingQtyPercentage: number;
  notesCount: number;
  onOpenNotes: () => void;
  onEdit: () => void;
}

const formatINR = (value: number): string => `₹${(value || 0).toLocaleString("en-IN")}`;

const Field = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0">
    <p className="text-[10.5px] uppercase tracking-wide text-[var(--nu-text-muted)] font-medium">{label}</p>
    <p className="text-[13px] font-semibold text-[var(--nu-text)] truncate" title={value}>
      {value || "—"}
    </p>
  </div>
);

const ProjectWorkspaceHeader = ({
  project,
  progressPercent,
  profitMargin,
  hasRevenue,
  pendingQtyPercentage,
  notesCount,
  onOpenNotes,
  onEdit,
}: Props) => {
  const healthStatus = getProjectHealthStatus({ profitMargin, hasRevenue, pendingQtyPercentage });

  const handleComingSoon = (feature: string) => alert(`${feature} — coming soon.`);

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-[var(--nu-shadow-sm)] p-4">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-[19px] font-bold text-[var(--nu-text)] truncate">{project.projectTitle || "Untitled Project"}</h1>
            <Badge tone={statusTone(project.projectStatus)} dot>
              {project.projectStatus || "—"}
            </Badge>
          </div>
          <p className="text-[12px] text-[var(--nu-text-muted)] mt-0.5">
            PR {project.prNo || "—"} · {project.client || "—"} · {project.department || "—"}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-5 gap-y-2.5 mt-3.5">
            <Field label="Project Manager" value={project.primaryProjectManager} />
            <Field label="Project Engineer" value={project.projectEngineer} />
            <Field label="Project Coordinator" value={project.projectCoordinator} />
            <Field label="Contract Type" value={project.contractType} />
            <Field label="Work Order Value" value={formatINR(project.workOrderValueINR || 0)} />
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0 xl:pl-4 xl:border-l border-[var(--nu-border)]">
          <ProjectHealthRing status={healthStatus} percentage={progressPercent} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2.5 mt-4 pt-3.5 border-t border-[var(--nu-border)]">
        <Button variant="secondary" size="sm" icon={<StickyNote size={13} />} onClick={onOpenNotes}>
          Project Notes
          <span className="bg-[var(--nu-accent)] text-white px-1.5 py-0.5 rounded-full text-[10px] font-bold ml-0.5">
            {notesCount}
          </span>
        </Button>

        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" icon={<Pencil size={13} />} onClick={onEdit}>
            Edit
          </Button>
          <Button variant="secondary" size="sm" icon={<FileText size={13} />} onClick={() => handleComingSoon("Documents")}>
            Documents
          </Button>
          <Button variant="secondary" size="sm" icon={<Printer size={13} />} onClick={() => window.print()}>
            Print
          </Button>
          <Button variant="secondary" size="sm" icon={<Share2 size={13} />} onClick={() => handleComingSoon("Share")}>
            Share
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ProjectWorkspaceHeader;
