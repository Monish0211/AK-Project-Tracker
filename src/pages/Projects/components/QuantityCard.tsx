import { useState } from "react";

type Row = {
  id: number;
  description: string;
  woQty: number | "";
  invoiceQty: number | "";
  unitRate: number | "";
};

const QuantityCard = () => {
  const [rows, setRows] = useState<Row[]>([
    {
      id: 1,
      description: "",
      woQty: "",
      invoiceQty: "",
      unitRate: "",
    },
  ]);

  const addRow = () => {
    setRows([
      ...rows,
      {
        id: rows.length + 1,
        description: "",
        woQty: "",
        invoiceQty: "",
        unitRate: "",
      },
    ]);
  };

  const deleteRow = (id: number) => {
    setRows(rows.filter((row) => row.id !== id));
  };

  const updateRow = (
    id: number,
    field: keyof Row,
    value: string | number
  ) => {
    setRows(
      rows.map((row) =>
        row.id === id
          ? {
              ...row,
              [field]: value,
            }
          : row
      )
    );
  };

  const totalWO = rows.reduce(
    (sum, row) => sum + (Number(row.woQty) || 0),
    0
  );

  const totalInvoice = rows.reduce(
    (sum, row) => sum + (Number(row.invoiceQty) || 0),
    0
  );

  const totalPending = rows.reduce(
    (sum, row) =>
      sum +
      ((Number(row.woQty) || 0) -
        (Number(row.invoiceQty) || 0)),
    0
  );

  const totalPendingAmount = rows.reduce(
    (sum, row) =>
      sum +
      (((Number(row.woQty) || 0) -
        (Number(row.invoiceQty) || 0)) *
        (Number(row.unitRate) || 0)),
    0
  );

  const pendingInvoicePercent =
    totalWO === 0
      ? 0
      : (totalPending / totalWO) * 100;

  return (
    <div className="bg-white rounded-xl shadow-md p-6 mt-8">
      <h2 className="text-2xl font-semibold mb-6">
        Quantity Details
      </h2>

      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-slate-100">
            <th className="border p-3">Item</th>
            <th className="border p-3">Description</th>
            <th className="border p-3">WO Qty</th>
            <th className="border p-3">Invoice Qty</th>
            <th className="border p-3">Pending Qty</th>
            <th className="border p-3">Unit Rate</th>
            <th className="border p-3">Pending Amount</th>
            <th className="border p-3">Action</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => {
            const wo = Number(row.woQty) || 0;
            const invoice = Number(row.invoiceQty) || 0;
            const rate = Number(row.unitRate) || 0;

            const pendingQty = wo - invoice;
            const pendingAmount = pendingQty * rate;

            return (
              <tr key={row.id}>
                <td className="border p-2 text-center">
                  {row.id}
                </td>

                <td className="border p-2">
                  <input
                    className="w-full border rounded p-2"
                    placeholder="Description"
                    value={row.description}
                    onChange={(e) =>
                      updateRow(
                        row.id,
                        "description",
                        e.target.value
                      )
                    }
                  />
                </td>

                <td className="border p-2">
                  <input
                    type="number"
                    className="w-full border rounded p-2"
                    value={row.woQty}
                    onChange={(e) =>
                      updateRow(
                        row.id,
                        "woQty",
                        e.target.value === ""
                          ? ""
                          : Number(e.target.value)
                      )
                    }
                  />
                </td>

                <td className="border p-2">
                  <input
                    type="number"
                    className="w-full border rounded p-2"
                    value={row.invoiceQty}
                    onChange={(e) =>
                      updateRow(
                        row.id,
                        "invoiceQty",
                        e.target.value === ""
                          ? ""
                          : Number(e.target.value)
                      )
                    }
                  />
                </td>

                <td className="border p-2 bg-gray-100 text-center font-semibold">
                  {pendingQty}
                </td>

                <td className="border p-2">
                  <input
                    type="number"
                    className="w-full border rounded p-2"
                    value={row.unitRate}
                    onChange={(e) =>
                      updateRow(
                        row.id,
                        "unitRate",
                        e.target.value === ""
                          ? ""
                          : Number(e.target.value)
                      )
                    }
                  />
                </td>

                <td className="border p-2 bg-gray-100 text-center font-semibold">
                  ₹{pendingAmount.toLocaleString()}
                </td>

                <td className="border p-2 text-center">
                  <button
                    onClick={() => deleteRow(row.id)}
                    className="text-red-600 hover:text-red-800"
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <button
        onClick={addRow}
        className="mt-6 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
      >
        + Add Item
      </button>

      <div className="grid grid-cols-5 gap-4 mt-8">
        <div className="bg-slate-100 rounded-lg p-4 text-center">
          <p className="text-gray-500 text-sm">
            Total WO Qty
          </p>
          <h2 className="text-2xl font-bold">
            {totalWO}
          </h2>
        </div>

        <div className="bg-slate-100 rounded-lg p-4 text-center">
          <p className="text-gray-500 text-sm">
            Total Invoice Qty
          </p>
          <h2 className="text-2xl font-bold">
            {totalInvoice}
          </h2>
        </div>

        <div className="bg-slate-100 rounded-lg p-4 text-center">
          <p className="text-gray-500 text-sm">
            Total Pending Qty
          </p>
          <h2 className="text-2xl font-bold">
            {totalPending}
          </h2>
        </div>

        <div className="bg-slate-100 rounded-lg p-4 text-center">
          <p className="text-gray-500 text-sm">
            Pending Amount
          </p>
          <h2 className="text-xl font-bold">
            ₹{totalPendingAmount.toLocaleString()}
          </h2>
        </div>

        <div className="bg-slate-100 rounded-lg p-4 text-center">
          <p className="text-gray-500 text-sm">
            Pending Invoice %
          </p>
          <h2 className="text-2xl font-bold">
            {pendingInvoicePercent.toFixed(2)}%
          </h2>
        </div>
      </div>
    </div>
  );
};

export default QuantityCard;