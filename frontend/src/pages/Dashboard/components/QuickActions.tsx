import { Plus, Upload, FileText, Building2, BarChart3, Users, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardBody } from "../../../components/ui/Card";

const TINTS: Record<string, string> = {
  accent: "bg-[var(--nu-accent-soft)] text-[var(--nu-accent)]",
  success: "bg-[var(--nu-success-soft)] text-[var(--nu-success)]",
  warning: "bg-[var(--nu-warning-soft)] text-[var(--nu-warning)]",
  info: "bg-[var(--nu-accent-soft)] text-[var(--nu-info)]",
};

const ACTIONS = [
  { title: "Add Project", icon: Plus, tint: "accent", to: "/projects/add" },
  { title: "Import Excel", icon: Upload, tint: "info", to: "/manpower" },
  // Invoice Management lives inside a project's own Edit Project > Invoices
  // step now (no standalone invoice module) — send Accounts to pick the
  // project first, same as every other invoice entry point in the app.
  { title: "Create Invoice", icon: FileText, tint: "success", to: "/projects" },
  { title: "Add Customer", icon: Building2, tint: "accent", to: "/customers" },
  { title: "Generate Report", icon: BarChart3, tint: "warning", to: "/reports" },
  { title: "Manage Team", icon: Users, tint: "info", to: "/manpower" },
] as const;

const QuickActions = () => {
  const navigate = useNavigate();

  return (
    <Card padded={false}>
      <CardHeader icon={<Zap size={15} />} title="Quick Actions" subtitle="Frequently used shortcuts" iconTint="neutral" />
      <CardBody>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {ACTIONS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.title}
                onClick={() => navigate(item.to)}
                className="flex items-center gap-2.5 px-3 py-2.5 h-[52px] bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-md)] hover:border-[var(--nu-border-strong)] hover:shadow-[var(--nu-shadow-md)] hover:-translate-y-0.5 transition-all duration-150"
              >
                <div className={`w-7 h-7 rounded-[var(--nu-radius-md)] flex items-center justify-center shrink-0 ${TINTS[item.tint]}`}>
                  <Icon size={14} />
                </div>
                <span className="font-medium text-[11.5px] text-[var(--nu-text-secondary)] leading-tight text-left">{item.title}</span>
              </button>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
};

export default QuickActions;
