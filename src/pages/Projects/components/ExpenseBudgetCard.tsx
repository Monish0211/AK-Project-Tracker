import type { Dispatch, SetStateAction } from "react";
import { Briefcase, Clock, FileText, IndianRupee, Wallet } from "lucide-react";
import type { Project } from "../../../types/Project";
import { Card, CardHeader, CardBody } from "../../../components/ui/Card";
import { StatTile } from "../../../components/ui/StatTile";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
}

const fieldClass =
  "w-full h-10 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface)] px-3 text-[13px] text-[var(--nu-text)] outline-none transition-shadow focus:ring-2 focus:ring-[var(--nu-accent)]/25 focus:border-[var(--nu-accent)]";
const labelClass = "block text-[11.5px] font-medium text-[var(--nu-text-secondary)] mb-1.5";

export default function ExpenseBudgetCard({ project, setProject }: Props) {
  const manhourBudgetAmount = project.manhourBudgetAmount || 0;
  const manhourBudgetHours = project.manhourBudgetHours || 0;
  const manhourBudgetRemarks = project.manhourBudgetRemarks || "";

  const nonManhourBudgetAmount = project.nonManhourBudgetAmount || 0;
  const nonManhourBudgetRemarks = project.nonManhourBudgetRemarks || "";

  const totalProjectBudget = project.workOrderValueINR || 0;
  const totalProjectCost = manhourBudgetAmount + nonManhourBudgetAmount;
  const formatINR = (value: number) =>
    `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          emphasis="secondary"
          label="Man-Hour Budget"
          value={formatINR(manhourBudgetAmount)}
          icon={<Clock size={14} />}
          tint="accent"
        />
        <StatTile
          emphasis="secondary"
          label="Non Man-Hour Budget"
          value={formatINR(nonManhourBudgetAmount)}
          icon={<FileText size={14} />}
          tint="info"
        />
        <StatTile
          emphasis="secondary"
          label="Total Project Budget (WO)"
          value={formatINR(totalProjectBudget)}
          icon={<IndianRupee size={14} />}
          tint="success"
        />
        <StatTile
          emphasis="secondary"
          label="Total Project Cost"
          value={formatINR(totalProjectCost)}
          icon={<Wallet size={14} />}
          tint="warning"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        {/* Man-Hour Expense Budget */}
        <Card padded={false} elevated>
          <CardHeader
            icon={<Clock size={15} />}
            title="Man-Hour Expense Budget"
            subtitle="Engineering man-hour cost allocation"
          />
          <CardBody className="space-y-4">
            <div>
              <label className={labelClass}>Budget Amount (INR)</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--nu-text-muted)] text-[13px] font-semibold">
                  ₹
                </span>
                <input
                  type="number"
                  value={manhourBudgetAmount || ""}
                  onChange={(e) =>
                    setProject((prev) => ({
                      ...prev,
                      manhourBudgetAmount: parseFloat(e.target.value) || 0,
                    }))
                  }
                  placeholder="Enter Man-Hour Budget Amount"
                  className={fieldClass + " pl-7"}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Budget Hours</label>
              <input
                type="number"
                value={manhourBudgetHours || ""}
                onChange={(e) =>
                  setProject((prev) => ({
                    ...prev,
                    manhourBudgetHours: parseFloat(e.target.value) || 0,
                  }))
                }
                placeholder="Enter Budget Hours"
                className={fieldClass}
              />
            </div>

            <div>
              <label className={labelClass}>Remarks</label>
              <textarea
                value={manhourBudgetRemarks}
                onChange={(e) =>
                  setProject((prev) => ({
                    ...prev,
                    manhourBudgetRemarks: e.target.value,
                  }))
                }
                placeholder="Enter remarks (e.g. Engineering Estimate)"
                rows={3}
                className={fieldClass + " !h-auto py-2 resize-none"}
              />
            </div>
          </CardBody>
        </Card>

        {/* Non Man-Hour Expense Budget */}
        <Card padded={false} elevated>
          <CardHeader
            icon={<Briefcase size={15} />}
            title="Non Man-Hour Expense Budget"
            subtitle="Travel, logistics and other cost allocation"
            iconTint="info"
          />
          <CardBody className="space-y-4">
            <div>
              <label className={labelClass}>Non Man-Hour Budget Amount (INR)</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--nu-text-muted)] text-[13px] font-semibold">
                  ₹
                </span>
                <input
                  type="number"
                  value={nonManhourBudgetAmount || ""}
                  onChange={(e) =>
                    setProject((prev) => ({
                      ...prev,
                      nonManhourBudgetAmount: parseFloat(e.target.value) || 0,
                    }))
                  }
                  placeholder="Enter Non Man-Hour Budget Amount"
                  className={fieldClass + " pl-7"}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Remarks</label>
              <textarea
                value={nonManhourBudgetRemarks}
                onChange={(e) =>
                  setProject((prev) => ({
                    ...prev,
                    nonManhourBudgetRemarks: e.target.value,
                  }))
                }
                placeholder="Enter remarks (e.g. Travel, Hotel, Accommodation)"
                rows={7}
                className={fieldClass + " !h-auto py-2 resize-none"}
              />
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
