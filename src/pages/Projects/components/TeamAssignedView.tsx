import { UserCheck, Building } from "lucide-react";

import type { Project } from "../../../types/Project";
import { Card, CardBody, CardHeader } from "../../../components/ui/Card";
import ExpandableTeamMembersCard from "./ExpandableTeamMembersCard";

interface Props {
  project: Project;
}

const LEADERSHIP_FIELDS: Array<{ label: string; icon: typeof UserCheck; key: keyof Project }> = [
  { label: "Primary PM", icon: UserCheck, key: "primaryProjectManager" },
  { label: "Secondary PM", icon: UserCheck, key: "secondaryProjectManager" },
  { label: "Project Coordinator", icon: UserCheck, key: "projectCoordinator" },
  { label: "Project Engineer", icon: UserCheck, key: "projectEngineer" },
  { label: "Client Coordinator", icon: Building, key: "clientCoordinator" },
];

export default function TeamAssignedView({ project }: Props) {
  return (
    <div className="space-y-3.5">
      {/* Project Leadership */}
      <Card padded={false}>
        <CardHeader icon={<UserCheck size={16} />} title="Project Leadership" subtitle="Key personnel assigned to this project" />
        <CardBody>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            {LEADERSHIP_FIELDS.map(({ label, icon: Icon, key }) => (
              <div
                key={label}
                className="flex items-start gap-3 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] p-3"
              >
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--nu-radius-md)] bg-[var(--nu-accent-soft)] text-[var(--nu-accent)]">
                  <Icon size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--nu-text-muted)]">{label}</p>
                  <p className="mt-0.5 text-[13px] font-semibold text-[var(--nu-text)] truncate" title={String(project[key] ?? "")}>
                    {(project[key] as string) || "—"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Team Assigned — Project Resource Cost Management module: resource
          summary, per-employee cost, and expandable daily entries all live
          inside this one component so Edit Project and View Project never
          show conflicting numbers. */}
      <ExpandableTeamMembersCard project={project} />
    </div>
  );
}
