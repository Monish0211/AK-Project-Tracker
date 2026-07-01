import type { Dispatch, SetStateAction } from "react";
import type { Project } from "../../../types/Project";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
}

const InvoiceCard = ({ project, setProject }: Props) => {
  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <h2 className="text-2xl font-semibold mb-6">
        Invoice Information
      </h2>

      <div className="grid grid-cols-2 gap-6">

        <div>
          <label className="block text-sm font-medium mb-2">
            Invoice Raised
          </label>

          <input
            type="number"
            value={project.invoiceRaised}
            onChange={(e) =>
              setProject({
                ...project,
                invoiceRaised: Number(e.target.value),
              })
            }
            className="w-full border rounded-lg p-3"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Payment Received
          </label>

          <input
            type="number"
            value={project.paymentReceived}
            onChange={(e) =>
              setProject({
                ...project,
                paymentReceived: Number(e.target.value),
              })
            }
            className="w-full border rounded-lg p-3"
          />
        </div>

      </div>
    </div>
  );
};

export default InvoiceCard;