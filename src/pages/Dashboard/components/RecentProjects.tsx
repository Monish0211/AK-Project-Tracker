import { Clock3, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardBody, CardFooter } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { EmptyState } from "../../../components/ui/EmptyState";
import { statusTone } from "../../../components/ui/statusTone";
import { getRecentProjects } from "../../../services/dashboardService";

const RecentProjects = () => {
  const navigate = useNavigate();
  const projects = getRecentProjects();

  return (
    <Card padded={false} className="flex flex-col min-h-[360px]">
      <CardHeader icon={<Clock3 size={15} />} title="Recent Projects" subtitle="Latest project entries" iconTint="neutral" />
      <CardBody className="flex-1 overflow-hidden">
        {projects.length === 0 ? (
          <EmptyState
            icon={<Clock3 size={18} />}
            title="No recent projects yet"
            description="Newly created projects will appear here, most recent first."
          />
        ) : (
          <table className="w-full table-fixed">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wide text-[var(--nu-text-muted)] border-b border-[var(--nu-border)]">
                <th className="w-14 text-left pb-2 font-medium">PR No</th>
                <th className="text-left pb-2 font-medium">Client</th>
                <th className="w-20 text-center pb-2 font-medium">Status</th>
                <th className="w-24 text-right pb-2 font-medium">WO Value</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr
                  key={project.id}
                  onClick={() => navigate(`/projects/view/${project.id}`)}
                  className="border-b border-[var(--nu-border)] last:border-none hover:bg-[var(--nu-surface-alt)] transition-colors cursor-pointer"
                >
                  <td className="py-2.5 text-[12px] font-medium text-[var(--nu-text)]">{project.prNo}</td>
                  <td className="py-2.5">
                    <div className="truncate text-[12px] text-[var(--nu-text-secondary)]" title={project.client}>
                      {project.client}
                    </div>
                  </td>
                  <td className="text-center py-2.5">
                    <Badge tone={statusTone(project.projectStatus)} dot>
                      {project.projectStatus || "—"}
                    </Badge>
                  </td>
                  <td className="text-right py-2.5 text-[12px] font-semibold text-[var(--nu-text)]">
                    ₹ {project.workOrderValueINR.toLocaleString("en-IN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardBody>
      <CardFooter>
        <Button
          variant="secondary"
          size="sm"
          icon={<ArrowRight size={13} />}
          className="w-full justify-center flex-row-reverse"
          onClick={() => navigate("/projects")}
        >
          View All Projects
        </Button>
      </CardFooter>
    </Card>
  );
};

export default RecentProjects;
