import { Building2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardBody, CardFooter } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { getDepartmentSummary } from "../../../services/dashboardService";

const BAR_COLORS = ["#2563eb", "#15803d", "#7c3aed", "#d97706", "#b91c1c", "#0e7490"];

const DepartmentSummary = () => {
  const navigate = useNavigate();
  const departments = getDepartmentSummary();
  const maxCount = Math.max(...departments.map((d) => d.count), 1);

  return (
    <Card padded={false} className="flex flex-col min-h-[360px]">
      <CardHeader icon={<Building2 size={15} />} title="Department Summary" subtitle="Projects by department" iconTint="neutral" />
      <CardBody className="flex-1">
        {departments.length === 0 ? (
          <EmptyState
            icon={<Building2 size={18} />}
            title="No department data available"
            description="Import projects to begin generating department analytics."
          />
        ) : (
          <div className="space-y-3.5">
            {departments.map((dept, index) => (
              <div key={dept.department}>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[12px] font-medium text-[var(--nu-text-secondary)]">{dept.department}</span>
                  <span className="text-[12px] font-semibold text-[var(--nu-text)]">{dept.count}</span>
                </div>
                <div className="w-full h-1.5 bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${(dept.count / maxCount) * 100}%`, background: BAR_COLORS[index % BAR_COLORS.length] }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardBody>
      <CardFooter>
        <Button variant="secondary" size="sm" className="w-full justify-center" onClick={() => navigate("/projects")}>
          View All Departments
        </Button>
      </CardFooter>
    </Card>
  );
};

export default DepartmentSummary;
