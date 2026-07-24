import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { UserCheck } from "lucide-react";
import type { Project } from "../../../types/Project";
import { getEmployees } from "../../../services/employeeService";
import { Card, CardHeader, CardBody } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
}

const labelClass = "block text-[11.5px] font-medium text-[var(--nu-text-secondary)] mb-1.5";

interface AutocompleteFieldProps {
  label: string;
  required?: boolean;
  value: string;
  onChange: (val: string) => void;
  suggestionsList: string[];
  placeholder: string;
}

const AutocompleteField = ({
  label,
  required,
  value,
  onChange,
  suggestionsList,
  placeholder,
}: AutocompleteFieldProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return suggestionsList;
    return suggestionsList.filter((name) => name.toLowerCase().includes(q));
  }, [value, suggestionsList]);

  return (
    <div ref={containerRef} className="relative">
      <label className={labelClass}>
        {label} {required && <span className="text-[var(--nu-danger)]">*</span>}
      </label>
      <Input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") setIsOpen(false);
        }}
        placeholder={placeholder}
        required={required}
      />
      {isOpen && filtered.length > 0 && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-40 overflow-y-auto rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface)] py-1 shadow-[var(--nu-shadow-md)]">
          {filtered.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                onChange(name);
                setIsOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-[13px] text-[var(--nu-text)] hover:bg-[var(--nu-surface-alt)] transition-colors"
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const ProjectLeadershipCard = ({ project, setProject }: Props) => {
  const masterEmployees = useMemo(() => getEmployees(), []);

  const employeeNames = useMemo(
    () =>
      Array.from(
        new Set(
          masterEmployees
            .map((emp) => emp.employeeName?.trim())
            .filter((name): name is string => typeof name === "string" && name !== "")
        )
      ).sort((a, b) => a.localeCompare(b)),
    [masterEmployees]
  );

  const reportingManagers = useMemo(
    () =>
      Array.from(
        new Set(
          masterEmployees
            .map((emp) => emp.reportingManager?.trim())
            .filter((name): name is string => typeof name === "string" && name !== "")
        )
      ).sort((a, b) => a.localeCompare(b)),
    [masterEmployees]
  );

  const handleChange = (field: keyof Project, value: string) => {
    setProject((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Card padded={false}>
      <CardHeader
        icon={<UserCheck size={16} />}
        title="Project Leadership"
        subtitle="Key personnel assigned to this project"
      />
      <CardBody>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          <AutocompleteField
            label="Primary Project Manager"
            required
            value={project.primaryProjectManager}
            onChange={(val) => handleChange("primaryProjectManager", val)}
            suggestionsList={reportingManagers}
            placeholder="Search or enter name"
          />
          <AutocompleteField
            label="Secondary Project Manager"
            value={project.secondaryProjectManager}
            onChange={(val) => handleChange("secondaryProjectManager", val)}
            suggestionsList={reportingManagers}
            placeholder="Search or enter name"
          />
          <AutocompleteField
            label="Project Coordinator"
            value={project.projectCoordinator}
            onChange={(val) => handleChange("projectCoordinator", val)}
            suggestionsList={employeeNames}
            placeholder="Search or enter name"
          />
          <AutocompleteField
            label="Project Engineer"
            value={project.projectEngineer}
            onChange={(val) => handleChange("projectEngineer", val)}
            suggestionsList={employeeNames}
            placeholder="Search or enter name"
          />
          <div>
            <label className={labelClass}>Client Coordinator</label>
            <Input
              type="text"
              value={project.clientCoordinator || ""}
              onChange={(e) => handleChange("clientCoordinator", e.target.value)}
              placeholder="Enter name"
            />
          </div>
        </div>
      </CardBody>
    </Card>
  );
};

export default ProjectLeadershipCard;
