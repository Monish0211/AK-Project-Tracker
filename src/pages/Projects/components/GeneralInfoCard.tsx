import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Building2, CalendarRange, FileText, Hash, LayoutGrid } from "lucide-react";
import type { Project } from "../../../types/Project";
import { getCustomers } from "../../../services/customerService";
import { getPmoCoordinators } from "../../../services/pmoCoordinatorService";
import { Card, CardHeader, CardBody } from "../../../components/ui/Card";

import { FieldError } from "../../../components/ui/FieldError";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
  errors?: Record<string, string>;
  clearError?: (field: string) => void;
}

import { PR_CATEGORIES as prCategories, PR_NUMBER_PREFIX_MAP as prNumberPrefixMap } from "../../../utils/createEmptyProject";

const departmentOptions = [
  "Design Engineering Services",
  "Environment",
  "Risk Management",
  "Training",
];

const applyPrNoPrefix = (rawValue: string, prefix: string) => {
  if (!prefix) {
    return rawValue;
  }

  for (let matchLength = Math.min(prefix.length, rawValue.length); matchLength >= 0; matchLength--) {
    if (rawValue.slice(0, matchLength) === prefix.slice(0, matchLength)) {
      return prefix + rawValue.slice(matchLength);
    }
  }

  return prefix + rawValue;
};

import { FormLabel } from "../../../components/ui/FormLabel";

const fieldClass =
  "w-full h-10 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface)] px-3 text-[13px] text-[var(--nu-text)] outline-none transition-shadow focus:ring-2 focus:ring-[var(--nu-accent)]/25 focus:border-[var(--nu-accent)]";
const labelClass = ""; // handled by FormLabel now

const Field = ({ label, children, required, error }: { label: string; children: React.ReactNode; required?: boolean; error?: string }) => (
  <div>
    <FormLabel required={required}>{label}</FormLabel>
    {children}
    <FieldError error={error} />
  </div>
);

const PmoCoordinatorAutocomplete = ({
  project,
  setProject,
  hasError,
}: {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>> | ((updater: (prev: Project) => Project) => void);
  hasError?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(project.pmoCoordinator || "");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const coordinators = useMemo(() => getPmoCoordinators(), []);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return [];
    return coordinators
      .filter((c) => c.toLowerCase().includes(q))
      .slice(0, 5); // Maximum of 4-5 suggestions
  }, [searchQuery, coordinators]);

  const showDropdown = isOpen && searchQuery.trim() !== "";

  // Sync searchQuery when project.pmoCoordinator changes
  useEffect(() => {
    setSearchQuery(project.pmoCoordinator || "");
  }, [project.pmoCoordinator]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        const trimmed = searchQuery.trim();
        setProject((prev) => ({ ...prev, pmoCoordinator: trimmed }));
        setSearchQuery(trimmed);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [searchQuery, setProject]);

  const selectOption = (name: string) => {
    setSearchQuery(name);
    setProject((prev) => ({ ...prev, pmoCoordinator: name }));
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) {
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filtered.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : filtered.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filtered.length) {
          selectOption(filtered[highlightedIndex]);
        } else {
          const trimmed = searchQuery.trim();
          const match = coordinators.find(
            (c) => c.toLowerCase() === trimmed.toLowerCase()
          );
          if (match) {
            selectOption(match);
          } else {
            setSearchQuery(project.pmoCoordinator || "");
            setIsOpen(false);
          }
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
      default:
        break;
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    setProject((prev) => ({ ...prev, pmoCoordinator: val }));
    if (val.trim() === "") {
      setIsOpen(false);
    } else {
      setIsOpen(true);
      setHighlightedIndex(0);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="text"
        value={searchQuery}
        onChange={handleChange}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        className={`${fieldClass} ${hasError ? "!border-[var(--nu-danger)]" : ""}`}
        placeholder="Search PMO Coordinator..."
      />
      {showDropdown && (
        <div className="absolute left-0 right-0 z-[100] mt-2.5 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface)] py-1 shadow-[var(--nu-shadow-md)] overflow-hidden animate-in fade-in duration-100">
          {filtered.length === 0 ? (
            <p className="px-3.5 py-2 text-[12.5px] text-[var(--nu-text-muted)]">
              No matching PMO Coordinator found
            </p>
          ) : (
            filtered.map((name, index) => {
              const isHighlighted = index === highlightedIndex;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => selectOption(name)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`w-full text-left px-3.5 py-2 text-[12.5px] transition-colors duration-100 ${
                    isHighlighted
                      ? "bg-[var(--nu-accent-soft)] text-[var(--nu-accent)] font-semibold"
                      : "text-[var(--nu-text)] hover:bg-[var(--nu-surface-alt)] hover:text-[var(--nu-accent)]"
                  }`}
                >
                  {name}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

const GeneralInfoCard = ({ project, setProject, errors = {}, clearError }: Props) => {
  const clientDropdownRef = useRef<HTMLDivElement>(null);
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [isOtherDepartment, setIsOtherDepartment] = useState(
    Boolean(project.department && !departmentOptions.includes(project.department))
  );

  const customers = useMemo(() => getCustomers(), []);

  const filteredCustomers = useMemo(() => {
    const input = project.client || "";

    if (!input.trim()) {
      return [];
    }

    return customers
      .filter((customer) =>
        customer.customerName.toLowerCase().includes(input.toLowerCase())
      )
      .slice(0, 8);
  }, [customers, project.client]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        clientDropdownRef.current &&
        !clientDropdownRef.current.contains(event.target as Node)
      ) {
        setIsClientDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
      {/* General Details */}
      <Card padded={false} elevated>
        <CardHeader
          icon={<LayoutGrid size={15} />}
          title="General Details"
          subtitle="PR identity and project title"
        />
        <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="PO Month" required={true} error={errors["poMonth"]}>
            <input
              type="month"
              data-field="poMonth"
              value={project.poMonth}
              onChange={(e) => {
                setProject({
                  ...project,
                  poMonth: e.target.value,
                });
                clearError?.("poMonth");
              }}
              className={`${fieldClass} ${errors["poMonth"] ? "!border-[var(--nu-danger)]" : ""}`}
            />
          </Field>

          <Field label="PR Category" required={true} error={errors["prCategory"]}>
            <select
              data-field="prCategory"
              value={project.prCategory}
              onChange={(e) => {
                const newCategory = e.target.value;
                const oldPrefix = prNumberPrefixMap[project.prCategory] || "";
                const newPrefix = prNumberPrefixMap[newCategory] || "";

                const numberPart = project.prNo.startsWith(oldPrefix)
                  ? project.prNo.slice(oldPrefix.length)
                  : project.prNo;

                setProject({
                  ...project,
                  prCategory: newCategory,
                  prNo: newPrefix + numberPart,
                });
                clearError?.("prCategory");
              }}
              className={`${fieldClass} ${errors["prCategory"] ? "!border-[var(--nu-danger)]" : ""}`}
            >
              <option value="">Select PR Category</option>

              {prCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </Field>

          <Field label="PR Number" required={true} error={errors["prNo"]}>
            <input
              type="text"
              data-field="prNo"
              value={project.prNo}
              onChange={(e) => {
                const prefix = prNumberPrefixMap[project.prCategory] || "";

                setProject({
                  ...project,
                  prNo: applyPrNoPrefix(e.target.value, prefix),
                });
                clearError?.("prNo");
              }}
              className={`${fieldClass} ${errors["prNo"] ? "!border-[var(--nu-danger)]" : ""}`}
              placeholder={
                prNumberPrefixMap[project.prCategory]
                  ? `${prNumberPrefixMap[project.prCategory]}Enter Number`
                  : "Enter PR Number"
              }
            />
          </Field>

          <Field label="Project Title" required={true} error={errors["projectTitle"]}>
            <input
              type="text"
              data-field="projectTitle"
              value={project.projectTitle}
              onChange={(e) => {
                setProject({
                  ...project,
                  projectTitle: e.target.value,
                });
                clearError?.("projectTitle");
              }}
              className={`${fieldClass} ${errors["projectTitle"] ? "!border-[var(--nu-danger)]" : ""}`}
              placeholder="Enter Project Title"
            />
          </Field>
        </CardBody>
      </Card>

      {/* Client & Department */}
      <Card padded={false} elevated>
        <CardHeader
          icon={<Building2 size={15} />}
          title="Client & Department"
          subtitle="Who this project is for"
          iconTint="success"
        />
        <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="relative sm:col-span-2" ref={clientDropdownRef}>
            <FormLabel required={true}>Client Name</FormLabel>
            <input
              type="text"
              data-field="client"
              value={project.client}
              onChange={(e) => {
                setProject({
                  ...project,
                  client: e.target.value,
                });
                setIsClientDropdownOpen(true);
                clearError?.("client");
              }}
              onFocus={() => setIsClientDropdownOpen(true)}
              className={`${fieldClass} ${errors["client"] ? "!border-[var(--nu-danger)]" : ""}`}
              placeholder="Enter Client Name"
            />
            <FieldError error={errors["client"]} />

            {isClientDropdownOpen && filteredCustomers.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-md)] shadow-[var(--nu-shadow-md)] max-h-56 overflow-y-auto nu-scrollbar">
                {filteredCustomers.map((customer) => (
                  <button
                    key={customer.customerName}
                    type="button"
                    className="w-full text-left px-3 py-2 text-[13px] text-[var(--nu-text)] hover:bg-[var(--nu-accent-soft)]"
                    onClick={() => {
                      setProject({
                        ...project,
                        client: customer.customerName,
                      });
                      setIsClientDropdownOpen(false);
                    }}
                  >
                    {customer.customerName}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Field label="Department" required={true} error={errors["department"]}>
            <select
              data-field="department"
              value={isOtherDepartment ? "Others" : project.department}
              onChange={(e) => {
                clearError?.("department");
                if (e.target.value === "Others") {
                  setIsOtherDepartment(true);
                  return;
                }

                setIsOtherDepartment(false);
                setProject({
                  ...project,
                  department: e.target.value,
                });
              }}
              className={`${fieldClass} ${errors["department"] ? "!border-[var(--nu-danger)]" : ""}`}
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

          <Field label="Domestic / Foreign" required={true} error={errors["domesticForeign"]}>
            <select
              data-field="domesticForeign"
              value={project.domesticForeign}
              onChange={(e) => {
                setProject({
                  ...project,
                  domesticForeign: e.target.value,
                });
                clearError?.("domesticForeign");
              }}
              className={`${fieldClass} ${errors["domesticForeign"] ? "!border-[var(--nu-danger)]" : ""}`}
            >
              <option value="">Select Domestic / Foreign</option>
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
                onChange={(e) =>
                  setProject({
                    ...project,
                    department: e.target.value,
                  })
                }
                className={fieldClass}
                placeholder="Enter Department"
              />
            </div>
          )}
        </CardBody>
      </Card>

      {/* Project Schedule */}
      <Card padded={false} elevated>
        <CardHeader
          icon={<CalendarRange size={15} />}
          title="Project Schedule"
          subtitle="Start, end and work order status"
          iconTint="info"
        />
        <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Work Order Status" required={true} error={errors["workOrderStatus"]}>
            <select
              data-field="workOrderStatus"
              value={project.workOrderStatus}
              onChange={(e) => {
                setProject({
                  ...project,
                  workOrderStatus: e.target.value,
                });
                clearError?.("workOrderStatus");
              }}
              className={`${fieldClass} ${errors["workOrderStatus"] ? "!border-[var(--nu-danger)]" : ""}`}
            >
              <option value="">Select Work Order Status</option>
              <option value="Received">Received</option>
              <option value="Yet to Receive">Yet to Receive</option>
              <option value="Pending">Pending</option>
              <option value="Closed">Closed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </Field>

          <Field label="Project Status" required={true} error={errors["projectStatus"]}>
            <select
              data-field="projectStatus"
              value={project.projectStatus}
              onChange={(e) => {
                setProject({
                  ...project,
                  projectStatus: e.target.value,
                });
                clearError?.("projectStatus");
              }}
              className={`${fieldClass} ${errors["projectStatus"] ? "!border-[var(--nu-danger)]" : ""}`}
            >
              <option value="">Select Project Status</option>
              <option value="Active">Active</option>
              <option value="Ongoing">Ongoing</option>
              <option value="Not Started">Not Started</option>
              <option value="Completed">Completed</option>
              <option value="On Hold">On Hold</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </Field>

          <Field label="Project Start Date" required={true} error={errors["projectStartDate"]}>
            <input
              type="date"
              data-field="projectStartDate"
              value={project.projectStartDate}
              onChange={(e) => {
                setProject({
                  ...project,
                  projectStartDate: e.target.value,
                });
                clearError?.("projectStartDate");
              }}
              className={`${fieldClass} ${errors["projectStartDate"] ? "!border-[var(--nu-danger)]" : ""}`}
            />
          </Field>

          <Field label="Project End Date">
            <input
              type="date"
              value={project.projectEndDate}
              onChange={(e) =>
                setProject({
                  ...project,
                  projectEndDate: e.target.value,
                })
              }
              className={fieldClass}
            />
          </Field>
        </CardBody>
      </Card>

      {/* Additional Information */}
      <Card padded={false} elevated>
        <CardHeader
          icon={<FileText size={15} />}
          title="Additional Information"
          subtitle="Contract type and references"
          iconTint="warning"
        />
        <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Contract Type" required={true} error={errors["contractType"]}>
            <select
              data-field="contractType"
              value={project.contractType || "LUMP SUM"}
              onChange={(e) => {
                setProject({
                  ...project,
                  contractType: e.target.value,
                });
                clearError?.("contractType");
              }}
              className={`${fieldClass} ${errors["contractType"] ? "!border-[var(--nu-danger)]" : ""}`}
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

          <Field label="PMO Coordinator" required={true} error={errors["pmoCoordinator"]}>
            <div data-field="pmoCoordinator">
              <PmoCoordinatorAutocomplete
                project={project}
                setProject={(update: any) => {
                  setProject(update);
                  clearError?.("pmoCoordinator");
                }}
                hasError={!!errors["pmoCoordinator"]}
              />
            </div>
          </Field>
        </CardBody>
      </Card>
    </div>
  );
};

export default GeneralInfoCard;
