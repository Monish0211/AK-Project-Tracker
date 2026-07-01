import { Trash2, Plus } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { Project } from "../../../types/Project";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
}

const QuantityCard = ({ project, setProject }: Props) => {
  const calculateTotals = (items: typeof project.quantityItems) => {
    const totalWOQty = items.reduce((sum, item) => sum + item.woQty, 0);

    const totalInvoiceQty = items.reduce(
      (sum, item) => sum + item.invoiceQty,
      0
    );

    const totalPendingQty = items.reduce(
      (sum, item) => sum + item.pendingQty,
      0
    );

    const pendingAmount = items.reduce(
      (sum, item) => sum + item.pendingAmount,
      0
    );

    return {
      totalWOQty,
      totalInvoiceQty,
      totalPendingQty,
      pendingAmount,
    };
  };

  const handleChange = (
    index: number,
    field: string,
    value: string
  ) => {
    const updated = [...project.quantityItems];

    const item = updated[index];

    switch (field) {
      case "description":
        item.description = value;
        break;

      case "woQty":
        item.woQty = Number(value) || 0;
        break;

      case "invoiceQty":
        item.invoiceQty = Number(value) || 0;
        break;

      case "unitRate":
        item.unitRate = Number(value) || 0;
        break;
    }

    item.pendingQty = item.woQty - item.invoiceQty;

    item.pendingAmount = item.pendingQty * item.unitRate;

    setProject({
      ...project,
      quantityItems: updated,
      ...calculateTotals(updated),
    });
  };

  const addRow = () => {
    setProject({
      ...project,
      quantityItems: [
        ...project.quantityItems,
        {
          id: crypto.randomUUID(),
          description: "",
          woQty: 0,
          invoiceQty: 0,
          pendingQty: 0,
          unitRate: 0,
          pendingAmount: 0,
        },
      ],
    });
  };

  const removeRow = (index: number) => {
    const updated = project.quantityItems.filter((_, i) => i !== index);

    setProject({
      ...project,
      quantityItems: updated,
      ...calculateTotals(updated),
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold">
          Quantity Details
        </h2>

        <button
          onClick={addRow}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition"
        >
          <Plus size={18} />
          Add Item
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border border-gray-300">
          <thead className="bg-gray-100">
            <tr>
              <th className="border p-2 w-14">#</th>

              <th className="border p-2">
                Description
              </th>

              <th className="border p-2">
                WO Qty
              </th>

              <th className="border p-2">
                Invoice Qty
              </th>

              <th className="border p-2">
                Pending Qty
              </th>

              <th className="border p-2">
                Unit Rate
              </th>

              <th className="border p-2">
                Pending Amount
              </th>

              <th className="border p-2 w-20">
                Action
              </th>
            </tr>
          </thead>

          <tbody>
            {project.quantityItems.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="text-center py-6 text-gray-500"
                >
                  No quantity items added.
                </td>
              </tr>
            ) : (
              project.quantityItems.map((item, index) => (
                <tr key={item.id}>
                  <td className="border p-2 text-center">
                    {index + 1}
                  </td>

                  <td className="border p-2">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) =>
                        handleChange(
                          index,
                          "description",
                          e.target.value
                        )
                      }
                      className="w-full px-2 py-1 outline-none rounded"
                    />
                  </td>

                  <td className="border p-2">
                    <input
                      type="number"
                      value={item.woQty}
                      onChange={(e) =>
                        handleChange(
                          index,
                          "woQty",
                          e.target.value
                        )
                      }
                      className="w-full px-2 py-1 outline-none rounded"
                    />
                  </td>

                  <td className="border p-2">
                    <input
                      type="number"
                      value={item.invoiceQty}
                      onChange={(e) =>
                        handleChange(
                          index,
                          "invoiceQty",
                          e.target.value
                        )
                      }
                      className="w-full px-2 py-1 outline-none rounded"
                    />
                  </td>

                  <td className="border p-2 text-center bg-gray-50">
                    {item.pendingQty}
                  </td>

                  <td className="border p-2">
                    <input
                      type="number"
                      value={item.unitRate}
                      onChange={(e) =>
                        handleChange(
                          index,
                          "unitRate",
                          e.target.value
                        )
                      }
                      className="w-full px-2 py-1 outline-none rounded"
                    />
                  </td>

                  <td className="border p-2 text-center bg-gray-50">
                    ₹
                    {item.pendingAmount.toLocaleString(
                      "en-IN",
                      {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }
                    )}
                  </td>

                  <td className="border p-2 text-center">
                    <button
                      onClick={() =>
                        removeRow(index)
                      }
                      disabled={
                        project.quantityItems.length === 1
                      }
                      className="disabled:opacity-40"
                    >
                      <Trash2
                        size={18}
                        className="text-red-500 hover:text-red-700"
                      />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-8">
        <div className="bg-gray-50 rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">
            Total WO Qty
          </p>

          <p className="text-2xl font-bold">
            {project.totalWOQty}
          </p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">
            Total Invoice Qty
          </p>

          <p className="text-2xl font-bold">
            {project.totalInvoiceQty}
          </p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">
            Total Pending Qty
          </p>

          <p className="text-2xl font-bold">
            {project.totalPendingQty}
          </p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">
            Pending Amount
          </p>

          <p className="text-2xl font-bold text-green-600">
            ₹
            {project.pendingAmount.toLocaleString(
              "en-IN",
              {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }
            )}
          </p>
        </div>
      </div>
    </div>
  );
};

export default QuantityCard;