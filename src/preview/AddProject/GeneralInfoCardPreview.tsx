import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Building2, CalendarRange, FileText, Hash, LayoutGrid } from "lucide-react";
import type { Project } from "../../types/Project";
import { getCustomers } from "../../services/customerService";
import { Card, CardHeader, CardBody } from "../../components/ui/Card";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
}

const prCategories = ["Malaysia", "Oman", "Abu Dhabi", "FZI", "Elixir Qatar", "India", "Qatar"];

const departmentOptions = ["Design Engineering Services", "Environment", "Risk Management", "Training"];

const prNumberPrefixMap: Record<string, string> = {
  Malaysia: "MYPR-",
  Oman: "EE-",
  "Abu Dhabi": "PRAD-",
  FZI: "PRI-",
  "Elixir Qatar": "EE-Q-",
  India: "PR-",
  Qatar: "Q-PR-",
};

const applyPrNoPrefix = (rawValue: string, prefix: string) => {
  if (!prefix) return rawValue;
  for (let matchLength = Math.min(prefix.length, rawValue.length); matchLength >= 0; matchLength--) {
    if (rawValue.slice(0, matchLength) === prefix.slice(0, matchLength)) {
      return prefix + rawValue.slice(matchLength);
    }
  }
  return prefix + rawValue;
};

const fieldClass =
  "w-full h-10 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface)] px-3 text-[13px] text-[var(--nu-text)] outline-none transition-shadow focus:ring-2 focus:ring-[var(--nu-accent)]/25 focus:border-[var(--nu-accent)]";
const labelClass = "block text-[11.5px] font-medium text-[var(--nu-text-secondary)] mb-1.5";

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className={labelClass}>{label}</label>
    {children}
  </div>
);

const GeneralInfoCardPreview = ({ project, setProject }: Props) => {
  const clientDropdownRef = useRef<HTMLDivElement>(null);
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [isOtherDepartment, setIsOtherDepartment] = useState(
    Boolean(project.department && !departmentOptions.includes(project.department))
  );

  const customers = useMemo(() => getCustomers(), []);

  const filteredCustomers = useMemo(() => {
    const input = project.client || "";
    if (!input.trim()) return [];
    return customers.filter((c) => c.customerName.toLowerCase().includes(input.toLowerCase())).slice(0, 8);
  }, [customers, project.client]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(event.target as Node)) {
        setIsClientDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
      {/* General Details */}
      <Card padded={false} elevated>
        <CardHeader icon={<LayoutGrid size={15} />} title="General Details" subtitle="PR identity and project title" />
        <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="PO Month">
            <input
              type="month"
              value={project.poMonth}
              onChange={(e) => setProject({ ...project, poMonth: e.target.value })}
              className={fieldClass}
            />
          </Field>

          <Field label="PR Category">
            <select
              value={project.prCategory}
              onChange={(e) => {
                const newCategory = e.target.value;
                const oldPrefix = prNumberPrefixMap[project.prCategory] || "";
                const newPrefix = prNumberPrefixMap[newCategory] || "";
                const numberPart = project.prNo.startsWith(oldPrefix) ? project.prNo.slice(oldPrefix.length) : project.prNo;
                setProject({ ...project, prCategory: newCategory, prNo: newPrefix + numberPart });
              }}
              className={fieldClass}
            >
              <option value="">Select PR Category</option>
              {prCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </Field>

          <Field label="PR Number">
            <input
              type="text"
              value={project.prNo}
              onChange={(e) => {
                const prefix = prNumberPrefixMap[project.prCategory] || "";
                setProject({ ...project, prNo: applyPrNoPrefix(e.target.value, prefix) });
              }}
              className={fieldClass}
              placeholder={prNumberPrefixMap[project.prCategory] ? `${prNumberPrefixMap[project.prCategory]}Enter Number` : "Enter PR Number"}
            />
          </Field>

          <Field label="Project Title">
            <input
              type="text"
              value={project.projectTitle}
              onChange={(e) => setProject({ ...project, projectTitle: e.target.value })}
              className={fieldClass}
              placeholder="Enter Project Title"
            />
          </Field>
        </CardBody>
      </Card>

      {/* Client & Department */}
      <Card padded={false} elevated>
        <CardHeader icon={<Building2 size={15} />} title="Client & Department" subtitle="Who this project is for" iconTint="success" />
        <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="relative sm:col-span-2" ref={clientDropdownRef}>
            <label className={labelClass}>Client Name</label>
            <input
              type="text"
              value={project.client}
              onChange={(e) => {
                setProject({ ...project, client: e.target.value });
                setIsClientDropdownOpen(true);
              }}
              onFocus={() => setIsClientDropdownOpen(true)}
              className={fieldClass}
              placeholder="Enter Client Name"
            />
            {isClientDropdownOpen && filteredCustomers.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-md)] shadow-[var(--nu-shadow-md)] max-h-56 overflow-y-auto nu-scrollbar">
                {filteredCustomers.map((customer) => (
                  <button
                    key={customer.customerName}
                    type="button"
                    className="w-full text-left px-3 py-2 text-[13px] text-[var(--nu-text)] hover:bg-[var(--nu-accent-soft)]"
                    onClick={() => {
                      setProject({ ...project, client: customer.customerName });
                      setIsClientDropdownOpen(false);
                    }}
                  >
                    {customer.customerName}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Field label="Department">
            <select
              value={isOtherDepartment ? "Others" : project.department}
              onChange={(e) => {
                if (e.target.value === "Others") {
                  setIsOtherDepartment(true);
                  return;
                }
                setIsOtherDepartment(false);
                setProject({ ...project, department: e.target.value });
              }}
              className={fieldClass}
            >
              <option value="">Select Department</option>
              {departmentOptions.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
              <option value="Others">Others</option>
            </select>
          </Field>

          <Field label="Domestic / Foreign">
            <select
              value={project.domesticForeign}
              onChange={(e) => setProject({ ...project, domesticForeign: e.target.value })}
              className={fieldClass}
            >
              <option value="">Select</option>
              <option value="Domestic">Domestic</option>
              <option value="Foreign">Foreign</option>
            </select>
          </Field>

          {isOtherDepartment && (
            <div className="sm:col-span-2">
              <label className={labelClass}>Other Department</label>
              <input
                type="text"
                value={project.department}
                onChange={(e) => setProject({ ...project, department: e.target.value })}
                className={fieldClass}
                placeholder="Enter Department"
              />
            </div>
          )}
        </CardBody>
      </Card>

      {/* Project Schedule */}
      <Card padded={false} elevated>
        <CardHeader icon={<CalendarRange size={15} />} title="Project Schedule" subtitle="Start, end and work order status" iconTint="info" />
        <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Work Order Status">
            <select
              value={project.workOrderStatus}
              onChange={(e) => setProject({ ...project, workOrderStatus: e.target.value })}
              className={fieldClass}
            >
              <option value="">Select</option>
              <option value="Received">Received</option>
              <option value="Pending">Pending</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </Field>

          <Field label="Project Status">
            <select
              value={project.projectStatus}
              onChange={(e) => setProject({ ...project, projectStatus: e.target.value })}
              className={fieldClass}
            >
              <option value="">Select</option>
              <option value="Active">Active</option>
              <option value="Completed">Completed</option>
              <option value="On Hold">On Hold</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </Field>

          <Field label="Project Start Date">
            <input
              type="date"
              value={project.projectStartDate}
              onChange={(e) => setProject({ ...project, projectStartDate: e.target.value })}
              className={fieldClass}
            />
          </Field>

          <Field label="Project End Date">
            <input
              type="date"
              value={project.projectEndDate}
              onChange={(e) => setProject({ ...project, projectEndDate: e.target.value })}
              className={fieldClass}
            />
          </Field>
        </CardBody>
      </Card>

      {/* Additional Information */}
      <Card padded={false} elevated>
        <CardHeader icon={<FileText size={15} />} title="Additional Information" subtitle="Contract type and references" iconTint="warning" />
        <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Contract Type">
            <select
              value={project.contractType || "LUMP SUM"}
              onChange={(e) => setProject({ ...project, contractType: e.target.value })}
              className={fieldClass}
            >
              <option value="LUMP SUM">LUMP SUM</option>
              <option value="ARC">ARC</option>
            </select>
          </Field>

          <Field label="PR No. Preview">
            <div className="h-10 flex items-center gap-2 px-3 rounded-[var(--nu-radius-md)] bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] text-[13px] text-[var(--nu-text-secondary)]">
              <Hash size={13} className="text-[var(--nu-text-muted)]" />
              {project.prNo || "—"}
            </div>
          </Field>
        </CardBody>
      </Card>
    </div>
  );
};

export default GeneralInfoCardPreview;
