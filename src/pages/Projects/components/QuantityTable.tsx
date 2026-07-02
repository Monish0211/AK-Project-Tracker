import type { QuantityItem } from "../../../types/QuantityItem";

interface Props {
  items: QuantityItem[];
}

const QuantityTable = ({ items }: Props) => {
  return (
    <div className="bg-white rounded-xl shadow-md p-6">

      <h2 className="text-2xl font-semibold mb-6">
        Quantity Details
      </h2>

      <div className="overflow-x-auto">

        <table className="min-w-full border border-gray-300">

          <thead className="bg-slate-100">

            <tr>

              <th className="border p-3">
                #
              </th>

              <th className="border p-3 text-left">
                Description
              </th>

              <th className="border p-3">
                WO Qty
              </th>

              <th className="border p-3">
                Invoice Qty
              </th>

              <th className="border p-3">
                Pending Qty
              </th>

              <th className="border p-3">
                Unit Rate
              </th>

              <th className="border p-3">
                Pending Amount
              </th>

            </tr>

          </thead>

          <tbody>

            {items.length === 0 ? (

              <tr>

                <td
                  colSpan={7}
                  className="text-center p-6 text-gray-500"
                >
                  No Quantity Details Available
                </td>

              </tr>

            ) : (

              items.map((item, index) => (

                <tr
                  key={item.id}
                  className="border-b"
                >

                  <td className="border p-3 text-center">
                    {index + 1}
                  </td>

                  <td className="border p-3">
                    {item.description || "-"}
                  </td>

                  <td className="border p-3 text-center">
                    {item.woQty}
                  </td>

                  <td className="border p-3 text-center">
                    {item.invoiceQty}
                  </td>

                  <td className="border p-3 text-center">
                    {item.pendingQty}
                  </td>

                  <td className="border p-3 text-right">
                    ₹{" "}
                    {item.unitRate.toLocaleString(
                      "en-IN"
                    )}
                  </td>

                  <td className="border p-3 text-right font-semibold text-red-600">
                    ₹{" "}
                    {item.pendingAmount.toLocaleString(
                      "en-IN"
                    )}
                  </td>

                </tr>

              ))

            )}

          </tbody>

        </table>

      </div>

    </div>
  );
};

export default QuantityTable;