import { FileText, IndianRupee, Gauge, Pencil, Printer, Share2, StickyNote, Wallet } from "lucide-react";
import type { ReactNode } from "react";
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
  invoiceRaised: number;
  outstanding: number;
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

const HeroChip = ({ icon, label, value }: { icon: ReactNode; label: string; value: string }) => (
  <div className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--nu-radius-md)] bg-white/[0.07] border border-white/[0.1] shrink-0">
    <div className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center shrink-0">{icon}</div>
    <div className="leading-tight">
      <p className="text-[9.5px] uppercase tracking-wide text-white/55 font-medium">{label}</p>
      <p className="text-[12.5px] font-semibold text-white whitespace-nowrap">{value}</p>
    </div>
  </div>
);

const ProjectWorkspaceHeader = ({
  project,
  progressPercent,
  profitMargin,
  hasRevenue,
  pendingQtyPercentage,
  invoiceRaised,
  outstanding,
  notesCount,
  onOpenNotes,
  onEdit,
}: Props) => {
  const healthStatus = getProjectHealthStatus({ profitMargin, hasRevenue, pendingQtyPercentage });

  const handleComingSoon = (feature: string) => alert(`${feature} — coming soon.`);

  return (
    <div className="rounded-[var(--nu-radius-lg)] overflow-hidden border border-[var(--nu-border)] shadow-[var(--nu-shadow-sm)]">
      {/* Hero band */}
      <div
        className="relative px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
        style={{ background: "linear-gradient(120deg, #0f2447 0%, #14335f 45%, #0e5a73 100%)" }}
      >
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-white/50 font-semibold mb-1">Projects</p>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-[22px] font-bold text-white leading-tight truncate max-w-xl" title={project.projectTitle}>
              {project.projectTitle || "Untitled Project"}
            </h1>
            <Badge tone={statusTone(project.projectStatus)} dot>
              {project.projectStatus || "—"}
            </Badge>
            {project.workOrderStatus && <Badge tone="info">WO: {project.workOrderStatus}</Badge>}
            {project.projectStatus === "Completed" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-400/30">
                ✅ Completed Project
              </span>
            )}
          </div>
          <p className="text-[12.5px] text-[#a9bfda] mt-1">
            PR {project.prNo || "—"} · {project.client || "—"} · {project.department || "—"}
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap justify-end">
          <HeroChip icon={<IndianRupee size={13} className="text-sky-300" />} label="Work Order Value" value={formatINR(project.workOrderValueINR || 0)} />
          <HeroChip icon={<Wallet size={13} className="text-red-300" />} label="Outstanding" value={formatINR(outstanding)} />
          <HeroChip icon={<FileText size={13} className="text-emerald-300" />} label="Invoice Raised" value={formatINR(invoiceRaised)} />
          <HeroChip icon={<Gauge size={13} className="text-amber-300" />} label="Completion" value={`${progressPercent.toFixed(0)}%`} />
        </div>
      </div>

      {/* Detail + actions band */}
      <div className="bg-[var(--nu-surface)] p-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-5 gap-y-2.5">
              <Field label="Project Manager" value={project.primaryProjectManager} />
              <Field label="Project Engineer" value={project.projectEngineer} />
              <Field label="Project Coordinator" value={project.projectCoordinator} />
              <Field label="PMO Coordinator" value={project.pmoCoordinator || "—"} />
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
            Workspace
            <span className="bg-[var(--nu-accent)] text-white px-1.5 py-0.5 rounded-full text-[10px] font-bold ml-0.5">
              {notesCount}
            </span>
          </Button>

          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" icon={<Pencil size={13} />} onClick={onEdit}>
              Edit Project
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
    </div>
  );
};

export default ProjectWorkspaceHeader;
