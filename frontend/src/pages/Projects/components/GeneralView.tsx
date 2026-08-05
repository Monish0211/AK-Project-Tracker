import { Building2, CalendarRange, FileSignature, FileText, LayoutGrid, Timer } from "lucide-react";
import type { Project } from "../../../types/Project";
import { inferPrCategory, inferDomesticForeign } from "../../../utils/createEmptyProject";
import { getApproxWorkingDays, getPlannedCompletionDate } from "../../../utils/projectScheduling";
import { formatMonthDisplay } from "../../../services/timesheetService";
import { Card, CardHeader, CardBody } from "../../../components/ui/Card";
import InfoField from "./InfoField";

interface Props {
  project: Project;
}

const formatDisplayDate = (value: string): string => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

/**
 * Read-only mirror of GeneralInfoCard.tsx (Add/Edit Project's General tab) —
 * same 6 cards, same order, same 2-column grid, so Add/Edit/View never
 * present this information differently. Every field here is a plain
 * InfoField display; nothing is editable.
 */
const GeneralView = ({ project }: Props) => {
  const plannedCompletionDate = getPlannedCompletionDate(project);
  const approxWorkingDays = getApproxWorkingDays(project);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
      {/* General Details */}
      <Card padded={false} elevated>
        <CardHeader icon={<LayoutGrid size={15} />} title="General Details" subtitle="PR identity and project title" />
        <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoField label="PO Month" value={project.poMonth ? formatMonthDisplay(project.poMonth) : ""} />
          <InfoField label="PR Category" value={inferPrCategory(project.prNo, project.prCategory)} />
          <InfoField label="PR Number" value={project.prNo} />
          <InfoField label="Project Title" value={project.projectTitle} />
        </CardBody>
      </Card>

      {/* Client & Department */}
      <Card padded={false} elevated>
        <CardHeader icon={<Building2 size={15} />} title="Client & Department" subtitle="Who this project is for" iconTint="success" />
        <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <InfoField label="Client Name" value={project.client} />
          </div>
          <InfoField label="Department" value={project.department} />
          <InfoField
            label="Domestic / Foreign"
            value={inferDomesticForeign(project.currency, project.prCategory || inferPrCategory(project.prNo), project.domesticForeign)}
          />
        </CardBody>
      </Card>

      {/* Project Schedule */}
      <Card padded={false} elevated>
        <CardHeader icon={<CalendarRange size={15} />} title="Project Schedule" subtitle="Start, end, completion and status" iconTint="info" />
        <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoField label="Work Order Status" value={project.workOrderStatus} />
          <InfoField label="Project Status" value={project.projectStatus} />
          <InfoField label="Project Start Date" value={project.projectStartDate ? formatDisplayDate(project.projectStartDate) : ""} />
          <InfoField label="Estimated End Date" value={project.projectEndDate ? formatDisplayDate(project.projectEndDate) : ""} />
          <InfoField
            label="Actual Completion Date"
            value={project.actualCompletionDate ? formatDisplayDate(project.actualCompletionDate) : "—"}
          />
          <InfoField label="Completed By" value={project.completedBy || "—"} />
          {project.completionRemarks && (
            <div className="sm:col-span-2">
              <InfoField label="Completion Remarks" value={project.completionRemarks} />
            </div>
          )}
        </CardBody>
      </Card>

      {/* Project Scheduling */}
      <Card padded={false} elevated>
        <CardHeader icon={<Timer size={15} />} title="Project Scheduling" subtitle="Estimated duration and completion" iconTint="info" />
        <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoField
            label="Estimated Duration"
            value={project.estimatedDuration ? `${project.estimatedDuration} ${project.durationUnit || "Days"}` : ""}
          />
          <InfoField label="Duration Unit" value={project.durationUnit || "Days"} />
          <InfoField
            label="Planned Completion Date"
            value={plannedCompletionDate ? formatDisplayDate(plannedCompletionDate) : ""}
            title="Auto-calculated from Project Start Date + Estimated Duration"
          />
          <InfoField
            label="Working Days (Approx.)"
            value={approxWorkingDays > 0 ? `${approxWorkingDays} Days` : ""}
          />
        </CardBody>
      </Card>

      {/* Work Order Details */}
      <Card padded={false} elevated>
        <CardHeader icon={<FileSignature size={15} />} title="Work Order Details" subtitle="Project work order information" iconTint="neutral" />
        <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoField label="Work Order Number" value={project.workOrderNumber} />
          <InfoField label="Work Order Date" value={project.workOrderDate ? formatDisplayDate(project.workOrderDate) : ""} />
          <InfoField label="EIC Name" value={project.eicName} />
          <InfoField label="Contact Number" value={project.contactNumber} />
          <div className="sm:col-span-2">
            <InfoField label="Email ID" value={project.emailId} />
          </div>
        </CardBody>
      </Card>

      {/* Additional Information */}
      <Card padded={false} elevated>
        <CardHeader icon={<FileText size={15} />} title="Additional Information" subtitle="Contract type and references" iconTint="warning" />
        <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoField label="Contract Type" value={project.contractType || "LUMP SUM"} />
          <InfoField label="PR No. Preview" value={project.prNo} />
          <InfoField label="PMO Coordinator" value={project.pmoCoordinator} />
        </CardBody>
      </Card>
    </div>
  );
};

export default GeneralView;
