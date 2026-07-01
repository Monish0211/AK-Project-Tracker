import type { Dispatch, SetStateAction } from "react";
import type { Project } from "../../../types/Project";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
}

const GeneralInfoCard = ({ project, setProject }: Props) => {
  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <h2 className="text-2xl font-semibold mb-6">
        General Information
      </h2>

      <div className="grid grid-cols-2 gap-6">

        {/* PO Month */}
        <div>
          <label className="block text-sm font-medium mb-2">
            PO Month
          </label>

          <input
            type="month"
            value={project.poMonth}
            onChange={(e) =>
              setProject({
                ...project,
                poMonth: e.target.value,
              })
            }
            className="w-full border rounded-lg p-3"
          />
        </div>

        {/* PR Number */}
        <div>
          <label className="block text-sm font-medium mb-2">
            PR Number
          </label>

          <input
            type="text"
            value={project.prNo}
            onChange={(e) =>
              setProject({
                ...project,
                prNo: e.target.value,
              })
            }
            className="w-full border rounded-lg p-3"
            placeholder="Enter PR Number"
          />
        </div>

        {/* Client */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Client Name
          </label>

          <input
            type="text"
            value={project.client}
            onChange={(e) =>
              setProject({
                ...project,
                client: e.target.value,
              })
            }
            className="w-full border rounded-lg p-3"
            placeholder="Enter Client Name"
          />
        </div>

        {/* Department */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Department
          </label>

          <input
            type="text"
            value={project.department}
            onChange={(e) =>
              setProject({
                ...project,
                department: e.target.value,
              })
            }
            className="w-full border rounded-lg p-3"
            placeholder="Enter Department"
          />
        </div>

        {/* Domestic / Foreign */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Domestic / Foreign
          </label>

          <select
            value={project.domesticForeign}
            onChange={(e) =>
              setProject({
                ...project,
                domesticForeign: e.target.value,
              })
            }
            className="w-full border rounded-lg p-3"
          >
            <option value="">Select</option>
            <option value="Domestic">Domestic</option>
            <option value="Foreign">Foreign</option>
          </select>
        </div>

        {/* Project Title */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Project Title
          </label>

          <input
            type="text"
            value={project.projectTitle}
            onChange={(e) =>
              setProject({
                ...project,
                projectTitle: e.target.value,
              })
            }
            className="w-full border rounded-lg p-3"
            placeholder="Enter Project Title"
          />
        </div>

        {/* Work Order Status */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Work Order Status
          </label>

          <select
            value={project.workOrderStatus}
            onChange={(e) =>
              setProject({
                ...project,
                workOrderStatus: e.target.value,
              })
            }
            className="w-full border rounded-lg p-3"
          >
            <option value="">Select</option>
            <option value="Received">Received</option>
            <option value="Pending">Pending</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>

        {/* Project Start Date */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Project Start Date
          </label>

          <input
            type="date"
            value={project.projectStartDate}
            onChange={(e) =>
              setProject({
                ...project,
                projectStartDate: e.target.value,
              })
            }
            className="w-full border rounded-lg p-3"
          />
        </div>

        {/* Project End Date */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Project End Date
          </label>

          <input
            type="date"
            value={project.projectEndDate}
            onChange={(e) =>
              setProject({
                ...project,
                projectEndDate: e.target.value,
              })
            }
            className="w-full border rounded-lg p-3"
          />
        </div>

        {/* Project Status */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Project Status
          </label>

          <select
            value={project.projectStatus}
            onChange={(e) =>
              setProject({
                ...project,
                projectStatus: e.target.value,
              })
            }
            className="w-full border rounded-lg p-3"
          >
            <option value="">Select</option>
            <option value="Active">Active</option>
            <option value="Completed">Completed</option>
            <option value="On Hold">On Hold</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>

      </div>
    </div>
  );
};

export default GeneralInfoCard;