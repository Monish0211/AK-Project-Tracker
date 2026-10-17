import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Building2, CalendarCheck, CalendarRange, Clock, FileSignature, FileText, Hash, LayoutGrid, Plus, StickyNote, Timer } from "lucide-react";
import type { Project } from "../../../types/Project";
import { getCustomers, loadCustomersForApp, customerExistsInMaster } from "../../../services/customerService";
import type { Customer } from "../../../types/CustomerModel";
import { PmoCoordinatorPicker } from "./PmoCoordinatorPicker";
import { getApproxWorkingDays, getPlannedCompletionDate } from "../../../utils/projectScheduling";
import { Card, CardHeader, CardBody } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { ProjectCompletionModal } from "../../../components/Projects/ProjectCompletionModal";
import { computeProjectFinancials } from "../../../utils/projectFinancials";
import { formatIndianCurrency } from "../../../utils/formatCurrency";

import { FieldError } from "../../../components/ui/FieldError";
import { PROJECT_STATUS_OPTIONS, WORK_ORDER_STATUS_OPTIONS } from "../../../constants/projectStatus";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
  errors?: Record<string, string>;
  clearError?: (field: string) => void;
  /**
   * Customer Master Missing Warning — scoped to Project Add/Edit only
   * (ProjectForm.tsx), NOT PR Request (RequestPRForm.tsx), even though both
   * render this same shared card. Defaults to true so ProjectForm's two
   * existing call sites (Add/Edit) need no change; RequestPRForm passes
   * false explicitly.
   */
  showCustomerMasterWarning?: boolean;
  /** PMO Coordinator "not linked to an account" hint — off for PR Requests, which stay text-only. Defaults to true. */
  showCoordinatorLinkHint?: boolean;
  /** Read Only assigned coordinators may not reassign the coordinator (the backend refuses it too). */
  lockPmoCoordinator?: boolean;
}

import { PR_CATEGORIES as prCategories, PR_NUMBER_PREFIX_MAP as prNumberPrefixMap, applyPrCategoryToPrNo } from "../../../utils/createEmptyProject";

const departmentOptions = [
  "Design Engineering Services",
  "Environment",
  "Risk Management",
  "Training",
];

const formatDisplayDate = (value: string): string => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

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

const labelClass = ""; // handled by FormLabel now

const Field = ({ label, children, required, error }: { label: string; children: React.ReactNode; required?: boolean; error?: string }) => (
  <div>
    <FormLabel required={required}>{label}</FormLabel>
    {children}
    <FieldError error={error} />
  </div>
);

const GeneralInfoCard = ({ project, setProject, errors = {}, clearError, showCustomerMasterWarning = true, showCoordinatorLinkHint = true, lockPmoCoordinator = false }: Props) => {
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  // Project Remarks — collapsed by default in both Add and Edit; whether
  // remarks already exist only changes the toggle's own label/icon below
  // ("+ Add..." vs. "Remarks Added"), never auto-expands the textarea.
  const [isRemarksOpen, setIsRemarksOpen] = useState(false);
  const REMARKS_MAX_LENGTH = 1000;
  const clientDropdownRef = useRef<HTMLDivElement>(null);
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [isOtherDepartment, setIsOtherDepartment] = useState(
    Boolean(project.department && !departmentOptions.includes(project.department))
  );

  const [customers, setCustomers] = useState<Customer[]>(() => getCustomers());

  useEffect(() => {
    let isMounted = true;
    loadCustomersForApp()
      .then((items) => {
        if (isMounted) setCustomers(items);
      })
      .catch((err) => {
        console.warn("Failed to load Customer Master for client autocomplete:", err);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const filteredCustomers = useMemo(() => {
    const input = project.client || "";

    if (!input.trim()) {
      return [];
    }

    return customers
      .filter(
        (customer) =>
          customer.status === "Active" &&
          customer.customerName.toLowerCase().includes(input.toLowerCase())
      )
      .slice(0, 8);
  }, [customers, project.client]);

  // Customer Master Missing Warning — non-blocking; reuses the SAME
  // `customers` state this card already loads for the autocomplete above
  // (no extra API call). Recomputes whenever the client text changes OR
  // `customers` itself refreshes (loadCustomersForApp resolving), so an
  // Edit Project load shows it immediately and it clears the moment either
  // the client name is changed to a real match or the newly-added customer
  // arrives in a later Customer Master refresh.
  const clientMissingFromCustomerMaster = useMemo(
    () => showCustomerMasterWarning && !customerExistsInMaster(customers, project.client || ""),
    [showCustomerMasterWarning, customers, project.client]
  );

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

  // Planned Completion Date and Working Days (Approx.) are always derived
  // from Project Start Date + Estimated Duration/Duration Unit — never their
  // own stored field — so they can never drift out of sync with a later
  // Project Start Date edit elsewhere on this same tab. Shared with the
  // read-only View Project screen (GeneralView.tsx) via projectScheduling.ts
  // so both always agree on the same numbers.
  const plannedCompletionDate = getPlannedCompletionDate(project);
  const approxWorkingDays = getApproxWorkingDays(project);

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
            <Input
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
              invalid={!!errors["poMonth"]}
            />
          </Field>

          <Field label="PR Category" required={true} error={errors["prCategory"]}>
            <Select
              data-field="prCategory"
              value={project.prCategory}
              onChange={(e) => {
                const newCategory = e.target.value;

                setProject({
                  ...project,
                  prCategory: newCategory,
                  prNo: applyPrCategoryToPrNo(project.prCategory, project.prNo, newCategory),
                });
                clearError?.("prCategory");
              }}
              invalid={!!errors["prCategory"]}
            >
              <option value="">Select PR Category</option>

              {prCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="PR Number" required={true} error={errors["prNo"]}>
            <Input
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
              invalid={!!errors["prNo"]}
              placeholder={
                prNumberPrefixMap[project.prCategory]
                  ? `${prNumberPrefixMap[project.prCategory]}Enter Number`
                  : "Enter PR Number"
              }
            />
          </Field>

          <Field label="RFQ No." required={true} error={errors["rfqNo"]}>
            <Input
              type="text"
              data-field="rfqNo"
              value={project.rfqNo || ""}
              onChange={(e) => {
                setProject({
                  ...project,
                  rfqNo: e.target.value,
                });
                clearError?.("rfqNo");
              }}
              onBlur={(e) => {
                const trimmed = e.target.value.trim();
                if (trimmed !== e.target.value) setProject({ ...project, rfqNo: trimmed });
              }}
              invalid={!!errors["rfqNo"]}
              maxLength={100}
              placeholder="Enter RFQ No."
            />
          </Field>

          <Field label="Project Title" required={true} error={errors["projectTitle"]}>
            <Input
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
              invalid={!!errors["projectTitle"]}
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
            <Input
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
              invalid={!!errors["client"]}
              placeholder="Enter Client Name"
            />
            <FieldError error={errors["client"]} />
            {clientMissingFromCustomerMaster && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                ⚠️ This customer does not exist in Customer Master. Kindly add the customer.
              </p>
            )}

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
            <Select
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
              invalid={!!errors["department"]}
            >
              <option value="">Select Department</option>
              {departmentOptions.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
              <option value="Others">Others</option>
            </Select>
          </Field>

          <Field label="Domestic / Foreign" required={true} error={errors["domesticForeign"]}>
            <Select
              data-field="domesticForeign"
              value={project.domesticForeign}
              onChange={(e) => {
                setProject({
                  ...project,
                  domesticForeign: e.target.value,
                });
                clearError?.("domesticForeign");
              }}
              invalid={!!errors["domesticForeign"]}
            >
              <option value="">Select Domestic / Foreign</option>
              <option value="Domestic">Domestic</option>
              <option value="Foreign">Foreign</option>
            </Select>
          </Field>

          {isOtherDepartment && (
            <div className="sm:col-span-2">
              <label className={labelClass}>Other Department</label>
              <Input
                type="text"
                value={project.department}
                onChange={(e) =>
                  setProject({
                    ...project,
                    department: e.target.value,
                  })
                }
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
            <Select
              data-field="workOrderStatus"
              value={project.workOrderStatus}
              onChange={(e) => {
                setProject({
                  ...project,
                  workOrderStatus: e.target.value,
                });
                clearError?.("workOrderStatus");
              }}
              invalid={!!errors["workOrderStatus"]}
            >
              <option value="">Select Work Order Status</option>
              {WORK_ORDER_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Project Status" required={true} error={errors["projectStatus"]}>
            <Select
              data-field="projectStatus"
              value={project.projectStatus}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "Completed" && project.projectStatus !== "Completed") {
                  setIsCompletionModalOpen(true);
                } else {
                  setProject({
                    ...project,
                    projectStatus: val,
                  });
                  clearError?.("projectStatus");
                }
              }}
              invalid={!!errors["projectStatus"]}
            >
              <option value="">Select Project Status</option>
              {PROJECT_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Project Start Date" required={true} error={errors["projectStartDate"]}>
            <Input
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
              invalid={!!errors["projectStartDate"]}
            />
          </Field>

          <Field label="Project End Date" error={errors["projectEndDate"]}>
            <Input
              type="date"
              data-field="projectEndDate"
              value={project.projectEndDate}
              onChange={(e) => {
                setProject({
                  ...project,
                  projectEndDate: e.target.value,
                });
                clearError?.("projectEndDate");
              }}
              invalid={!!errors["projectEndDate"]}
            />
          </Field>

          <div className="sm:col-span-2">
            {!isRemarksOpen ? (
              <button
                type="button"
                onClick={() => setIsRemarksOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--nu-accent)] hover:underline cursor-pointer"
              >
                {project.remarks ? (
                  <>
                    <StickyNote size={13} />
                    Remarks Added
                  </>
                ) : (
                  <>
                    <Plus size={13} />
                    Add Project Remarks (Optional)
                  </>
                )}
              </button>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <FormLabel>Project Remarks (Optional)</FormLabel>
                  <span className="text-[10.5px] text-[var(--nu-text-muted)]">
                    {(project.remarks || "").length}/{REMARKS_MAX_LENGTH}
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={project.remarks || ""}
                  maxLength={REMARKS_MAX_LENGTH}
                  onChange={(e) =>
                    setProject((prev) => ({
                      ...prev,
                      remarks: e.target.value,
                    }))
                  }
                  placeholder="Explain a delay or timeline-related issue — e.g. Client-side delay, pending approval..."
                  className="w-full p-2.5 bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-xl text-xs text-[var(--nu-text)] whitespace-pre-wrap"
                />
              </div>
            )}
          </div>

          {project.projectStatus === "Completed" && (
            <>
              <Field label="Actual Completion Date" error={errors["actualCompletionDate"]}>
                <Input
                  type="date"
                  data-field="actualCompletionDate"
                  value={project.actualCompletionDate || ""}
                  onChange={(e) => {
                    setProject((prev) => ({
                      ...prev,
                      actualCompletionDate: e.target.value,
                    }));
                    clearError?.("actualCompletionDate");
                  }}
                  invalid={!!errors["actualCompletionDate"]}
                />
              </Field>

              <div className="sm:col-span-2">
                <FormLabel>Completion Remarks</FormLabel>
                <textarea
                  rows={2}
                  value={project.completionRemarks || ""}
                  onChange={(e) =>
                    setProject((prev) => ({
                      ...prev,
                      completionRemarks: e.target.value,
                    }))
                  }
                  placeholder="Formal completion notes..."
                  className="w-full p-2.5 bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-xl text-xs text-[var(--nu-text)]"
                />
              </div>

              {/* Liquidated Damages (Oct 2026) — recorded once at completion, read-only afterwards. */}
              <div className="sm:col-span-2 rounded-xl border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] p-3 text-xs" data-field="liquidatedDamages">
                <FormLabel>Liquidated Damages (LD)</FormLabel>
                {project.ldApplicable === true || project.ldApplicable === false ? (
                  <p className="text-[var(--nu-text)] mt-1">
                    <strong>{project.ldApplicable ? `Yes — ${formatIndianCurrency(project.ldAmountINR ?? 0)}` : "No"}</strong>
                    {project.ldRemarks ? <span className="text-[var(--nu-text-muted)]"> · Ref: {project.ldRemarks}</span> : null}
                    <span className="block text-[10px] text-[var(--nu-text-muted)] mt-1">Recorded at completion; it cannot be edited here.</span>
                  </p>
                ) : (
                  <p className="text-[var(--nu-text-muted)] mt-1">Not recorded — this project was completed before LD was tracked.</p>
                )}
              </div>
            </>
          )}
        </CardBody>
      </Card>

      {/* Project Scheduling */}
      <Card padded={false} elevated>
        <CardHeader
          icon={<Timer size={15} />}
          title="Project Scheduling"
          subtitle="Estimated duration and completion"
          iconTint="info"
        />
        <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Estimated Duration">
            <Input
              type="number"
              min={0}
              value={project.estimatedDuration ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                setProject({
                  ...project,
                  estimatedDuration: raw === "" ? undefined : Number(raw),
                });
              }}
              placeholder="Enter Duration"
            />
          </Field>

          <Field label="Duration Unit">
            <Select
              value={project.durationUnit || "Days"}
              onChange={(e) =>
                setProject({
                  ...project,
                  durationUnit: e.target.value as "Days" | "Weeks" | "Months",
                })
              }
            >
              <option value="Days">Days</option>
              <option value="Weeks">Weeks</option>
              <option value="Months">Months</option>
            </Select>
          </Field>

          <Field label="Planned Completion Date">
            <div className="h-10 flex items-center gap-2 px-3 rounded-[var(--nu-radius-md)] bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] text-[13px] text-[var(--nu-text-secondary)]">
              <CalendarCheck size={13} className="text-[var(--nu-text-muted)]" />
              {plannedCompletionDate ? formatDisplayDate(plannedCompletionDate) : "—"}
            </div>
          </Field>

          <Field label="Working Days (Approx.)">
            <div className="h-10 flex items-center gap-2 px-3 rounded-[var(--nu-radius-md)] bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] text-[13px] text-[var(--nu-text-secondary)]">
              <Clock size={13} className="text-[var(--nu-text-muted)]" />
              {approxWorkingDays > 0 ? `${approxWorkingDays} Days` : "—"}
            </div>
          </Field>
        </CardBody>
      </Card>

      {/* Work Order Details */}
      <Card padded={false} elevated>
        <CardHeader
          icon={<FileSignature size={15} />}
          title="Work Order Details"
          subtitle="Project work order information"
          iconTint="neutral"
        />
        <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Work Order Number" required={true} error={errors["workOrderNumber"]}>
            <Input
              type="text"
              data-field="workOrderNumber"
              value={project.workOrderNumber || ""}
              onChange={(e) => {
                setProject({
                  ...project,
                  workOrderNumber: e.target.value,
                });
                clearError?.("workOrderNumber");
              }}
              invalid={!!errors["workOrderNumber"]}
              placeholder="Enter Work Order Number"
            />
          </Field>

          <Field label="Work Order Date" required={true} error={errors["workOrderDate"]}>
            <Input
              type="date"
              data-field="workOrderDate"
              value={project.workOrderDate || ""}
              onChange={(e) => {
                setProject({
                  ...project,
                  workOrderDate: e.target.value,
                });
                clearError?.("workOrderDate");
              }}
              invalid={!!errors["workOrderDate"]}
            />
          </Field>

          <Field label="EIC Name" required={true} error={errors["eicName"]}>
            <Input
              type="text"
              data-field="eicName"
              value={project.eicName || ""}
              onChange={(e) => {
                setProject({
                  ...project,
                  eicName: e.target.value,
                });
                clearError?.("eicName");
              }}
              invalid={!!errors["eicName"]}
              placeholder="Enter EIC Name"
            />
          </Field>

          <Field label="Contact Number">
            <Input
              type="tel"
              value={project.contactNumber || ""}
              onChange={(e) =>
                setProject({
                  ...project,
                  contactNumber: e.target.value,
                })
              }
              placeholder="Enter Contact Number"
            />
          </Field>

          <div className="sm:col-span-2">
            <FormLabel>Email ID</FormLabel>
            <Input
              type="email"
              value={project.emailId || ""}
              onChange={(e) =>
                setProject({
                  ...project,
                  emailId: e.target.value,
                })
              }
              placeholder="Enter Email Address"
            />
          </div>
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
            <Select
              data-field="contractType"
              value={project.contractType || "LUMP SUM"}
              onChange={(e) => {
                setProject({
                  ...project,
                  contractType: e.target.value,
                });
                clearError?.("contractType");
              }}
              invalid={!!errors["contractType"]}
            >
              <option value="LUMP SUM">LUMP SUM</option>
              <option value="ARC">ARC</option>
            </Select>
          </Field>

          <Field label="PR No. Preview">
            <div className="h-10 flex items-center gap-2 px-3 rounded-[var(--nu-radius-md)] bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] text-[13px] text-[var(--nu-text-secondary)]">
              <Hash size={13} className="text-[var(--nu-text-muted)]" />
              {project.prNo || "—"}
            </div>
          </Field>

          <Field label="PMO Coordinator" required={true} error={errors["pmoCoordinator"]}>
            <div data-field="pmoCoordinator">
              <PmoCoordinatorPicker
                project={project}
                setProject={(update: any) => {
                  setProject(update);
                  clearError?.("pmoCoordinator");
                }}
                hasError={!!errors["pmoCoordinator"]}
                showLinkHint={showCoordinatorLinkHint}
                disabled={lockPmoCoordinator}
              />
            </div>
          </Field>
        </CardBody>
      </Card>

      <ProjectCompletionModal
        isOpen={isCompletionModalOpen}
        projectTitle={project.projectTitle || "Untitled Project"}
        prNo={project.prNo || "—"}
        recordedLd={{ ldApplicable: project.ldApplicable ?? null, ldAmountINR: project.ldAmountINR ?? null }}
        workOrderValueINR={project.workOrderValueINR ?? null}
        profitBeforeLd={
          computeProjectFinancials({
            workOrderValueINR: project.workOrderValueINR ?? 0,
            manhourCosts: (project.resources ?? []).map((r) => r.manhourCost ?? 0),
            nonManhourRows: project.nonManhourExpenses ?? [],
            invoiceLines: [],
          }).profitBeforeLd
        }
        onConfirm={(data) => {
          // Form state only. The completion (and LD) reaches the server and
          // the local projects cache on Save (FormButtons), never before —
          // otherwise Completed Projects would show an unsaved completion
          // that Reports (server data) correctly does not.
          setProject((prev) => ({
            ...prev,
            projectStatus: "Completed",
            actualCompletionDate: data.actualCompletionDate,
            completionRemarks: data.completionRemarks,
            completedBy: data.completedBy,
            completedTimestamp: new Date().toISOString(),
            ...(data.ld ? { ldApplicable: data.ld.ldApplicable, ldAmountINR: data.ld.ldAmountINR, ldRemarks: data.ld.ldRemarks } : {}),
          }));
          clearError?.("projectStatus");
          setIsCompletionModalOpen(false);
        }}
        onCancel={() => setIsCompletionModalOpen(false)}
      />
    </div>
  );
};

export default GeneralInfoCard;
