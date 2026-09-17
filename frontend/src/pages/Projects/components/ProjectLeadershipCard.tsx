import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { UserCheck } from "lucide-react";
import type { Project } from "../../../types/Project";
import type { Employee } from "../../../types/EmployeeModel";
import { getEmployees, loadEmployeesForApp } from "../../../services/employeeService";
import { isEligibleManagerDesignation } from "../../../utils/employeeDesignation";
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
  // Sept 2026 — Team Assigned / Manpower Grade Display. Optional name -> grade
  // lookup (Employee.grade, e.g. "MG3"/"MG4"/"MG5" — whatever the Manpower
  // record actually has, never hard-coded). Purely a display concern: the
  // dropdown row renders "Name — Grade", but onChange(name) below still
  // passes just the plain name, so the persisted Project field (a plain
  // string) is completely unaffected. Omit this prop and the field renders
  // exactly as before (plain name suggestions) — used by Client Coordinator's
  // plain <Input>, which doesn't use this component at all.
  gradeByName?: Map<string, string>;
}

const AutocompleteField = ({
  label,
  required,
  value,
  onChange,
  suggestionsList,
  placeholder,
  gradeByName,
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

  // Search still matches by name (unchanged). Also allows matching by grade
  // (e.g. typing "MG4" surfaces every MG4 person) — optional per the spec,
  // additive only, never required for the existing name search to keep working.
  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return suggestionsList;
    return suggestionsList.filter((name) => {
      if (name.toLowerCase().includes(q)) return true;
      const grade = gradeByName?.get(name);
      return !!grade && grade.toLowerCase().includes(q);
    });
  }, [value, suggestionsList, gradeByName]);

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
          {filtered.map((name) => {
            const grade = gradeByName?.get(name)?.trim();
            return (
              <button
                key={name}
                type="button"
                onClick={() => {
                  // Persisted value stays the plain name — grade is display-only.
                  onChange(name);
                  setIsOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-[13px] text-[var(--nu-text)] hover:bg-[var(--nu-surface-alt)] transition-colors truncate"
              >
                {name}
                {grade && <span className="text-[var(--nu-text-secondary)]"> — {grade}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const ProjectLeadershipCard = ({ project, setProject }: Props) => {
  // Bug fix (Aug 2026): getEmployees() is a pure localStorage read — it only
  // has data once something has already called loadEmployeesForApp() to
  // hydrate that mirror from PostgreSQL (see employeeService.ts). This card
  // can be reached (via Add/Edit Project) without the user ever having
  // visited Manpower in this browser session, so it must trigger its own
  // load rather than assume the mirror is already populated — same fix
  // already applied to PmoAssistant.tsx for the identical symptom. Seeded
  // from getEmployees() so any already-hydrated mirror renders immediately;
  // the fetch below then refreshes it from the real backend.
  const [masterEmployees, setMasterEmployees] = useState<Employee[]>(() => getEmployees());

  useEffect(() => {
    let isMounted = true;
    loadEmployeesForApp()
      .then((result) => {
        if (isMounted) setMasterEmployees(result.employees);
      })
      .catch(() => {
        /* keep whatever the mirror already had — best-effort, matches PmoAssistant.tsx's precedent */
      });
    return () => {
      isMounted = false;
    };
  }, []);

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

  // Bug fix (Aug 2026): Primary/Secondary Project Manager used to suggest
  // the distinct set of Employee.reportingManager VALUES (i.e. "people who
  // happen to already be listed as someone else's manager") — never the
  // actual employee roster, and never designation-filtered. Now sources
  // real employeeName values, restricted to the approved eligible
  // designations (Manager / Senior Manager / Assistant Manager / Team Lead
  // / Lead — see isEligibleManagerDesignation()'s own doc comment for the
  // exact rule and the real designation values it was checked against).
  const eligibleManagerNames = useMemo(
    () =>
      Array.from(
        new Set(
          masterEmployees
            .filter((emp) => isEligibleManagerDesignation(emp.designation))
            .map((emp) => emp.employeeName?.trim())
            .filter((name): name is string => typeof name === "string" && name !== "")
        )
      ).sort((a, b) => a.localeCompare(b)),
    [masterEmployees]
  );

  // Sept 2026 — Team Assigned / Manpower Grade Display. Name -> grade lookup
  // sourced directly from the same masterEmployees mirror the two
  // suggestion lists above already build from — Employee.grade is already
  // returned by GET /employees (see employeeService.ts's BackendEmployeeDto),
  // so this is a pure frontend derivation, no new API call. Where the same
  // name appears on multiple employee records, prefers the first one with a
  // non-empty grade rather than silently overwriting it with a blank.
  const employeeGradeByName = useMemo(() => {
    const map = new Map<string, string>();
    masterEmployees.forEach((emp) => {
      const name = emp.employeeName?.trim();
      if (!name) return;
      const existing = map.get(name);
      if (!existing && emp.grade?.trim()) {
        map.set(name, emp.grade.trim());
      }
    });
    return map;
  }, [masterEmployees]);

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
            suggestionsList={eligibleManagerNames}
            gradeByName={employeeGradeByName}
            placeholder="Search or enter name"
          />
          <AutocompleteField
            label="Secondary Project Manager"
            value={project.secondaryProjectManager}
            onChange={(val) => handleChange("secondaryProjectManager", val)}
            suggestionsList={eligibleManagerNames}
            gradeByName={employeeGradeByName}
            placeholder="Search or enter name"
          />
          <AutocompleteField
            label="Project Coordinator"
            value={project.projectCoordinator}
            onChange={(val) => handleChange("projectCoordinator", val)}
            suggestionsList={employeeNames}
            gradeByName={employeeGradeByName}
            placeholder="Search or enter name"
          />
          <AutocompleteField
            label="Project Engineer"
            value={project.projectEngineer}
            onChange={(val) => handleChange("projectEngineer", val)}
            suggestionsList={employeeNames}
            gradeByName={employeeGradeByName}
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
