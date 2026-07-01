import type { Dispatch, SetStateAction } from "react";
import type { Project } from "../../../types/Project";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
}

const QuantityCard = ({ project, setProject }: Props) => {
  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <h2 className="text-2xl font-semibold mb-6">
        Quantity Information
      </h2>

      <div className="grid grid-cols-2 gap-6">

        {/* Total WO Quantity */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Total WO Quantity
          </label>

          <input
            type="number"
            value={project.totalWOQty}
            onChange={(e) => {
              const woQty = Number(e.target.value);

              setProject({
                ...project,
                totalWOQty: woQty,
                totalPendingQty: woQty - project.totalInvoiceQty,
              });
            }}
            className="w-full border rounded-lg p-3"
          />
        </div>

        {/* Total Invoice Quantity */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Total Invoice Quantity
          </label>

          <input
            type="number"
            value={project.totalInvoiceQty}
            onChange={(e) => {
              const invoiceQty = Number(e.target.value);

              setProject({
                ...project,
                totalInvoiceQty: invoiceQty,
                totalPendingQty:
                  project.totalWOQty - invoiceQty,
              });
            }}
            className="w-full border rounded-lg p-3"
          />
        </div>

        {/* Pending Quantity */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Pending Quantity
          </label>

          <input
            type="number"
            value={project.totalPendingQty}
            readOnly
            className="w-full border rounded-lg p-3 bg-gray-100"
          />
        </div>

      </div>
    </div>
  );
};

export default QuantityCard;