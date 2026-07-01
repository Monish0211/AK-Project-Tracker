import CreatableSelect from "react-select/creatable";
import type { Dispatch, SetStateAction } from "react";
import type { Project } from "../../../types/Project";
import { currencies } from "../../../data/currencies";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
}

const CommercialCard = ({ project, setProject }: Props) => {
  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <h2 className="text-2xl font-semibold mb-6">
        Commercial Information
      </h2>

      <div className="grid grid-cols-2 gap-6">

        {/* Contract Formalities */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Contract Formalities
          </label>

          <input
            type="text"
            value={project.contractFormalities}
            onChange={(e) =>
              setProject({
                ...project,
                contractFormalities: e.target.value,
              })
            }
            className="w-full border rounded-lg p-3"
            placeholder="Completed"
          />
        </div>

        {/* Payment Terms */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Payment Terms
          </label>

          <input
            type="text"
            value={project.paymentTerms}
            onChange={(e) =>
              setProject({
                ...project,
                paymentTerms: e.target.value,
              })
            }
            className="w-full border rounded-lg p-3"
            placeholder="30 Days / Advance / Milestone"
          />
        </div>

        {/* Work Order Value */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Work Order Value
          </label>

          <input
            type="number"
            value={project.workOrderValue}
            onChange={(e) =>
              setProject({
                ...project,
                workOrderValue: Number(e.target.value),
                workOrderValueINR:
                  Number(e.target.value) * project.contractExchangeRate,
              })
            }
            className="w-full border rounded-lg p-3"
          />
        </div>

        {/* Currency */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Currency
          </label>

          <CreatableSelect
            options={currencies}
            placeholder="Search or Add Currency..."

            value={
              project.currency
                ? {
                    value: project.currency,
                    label: project.currency,
                  }
                : null
            }

            onChange={(selected) =>
              setProject({
                ...project,
                currency: selected?.value || "",
              })
            }

            formatCreateLabel={(inputValue) =>
              `➕ Add "${inputValue}"`
            }

            isClearable
          />
        </div>

        {/* Exchange Rate */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Exchange Rate
          </label>

          <input
            type="number"
            value={project.contractExchangeRate}
            onChange={(e) =>
              setProject({
                ...project,
                contractExchangeRate: Number(e.target.value),
                workOrderValueINR:
                  project.workOrderValue * Number(e.target.value),
              })
            }
            className="w-full border rounded-lg p-3"
          />
        </div>

        {/* Work Order Value (INR) */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Work Order Value (INR)
          </label>

          <input
            type="number"
            value={project.workOrderValueINR}
            readOnly
            className="w-full border rounded-lg p-3 bg-gray-100 cursor-not-allowed"
          />

          <p className="text-xs text-gray-500 mt-1">
            Automatically calculated
          </p>
        </div>

      </div>
    </div>
  );
};

export default CommercialCard;