import type { Dispatch, SetStateAction } from "react";
import type { Customer } from "../../../types/CustomerModel";

import CustomerRow from "./CustomerRow";

interface Props {
  customers: Customer[];
  setCustomers: Dispatch<SetStateAction<Customer[]>>;
}

const CustomerTable = ({
  customers,
  setCustomers,
}: Props) => {
  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">

      <div className="overflow-x-auto">

        <table className="min-w-full">

          <thead className="bg-slate-50">

            <tr className="text-sm text-slate-700">

              <th className="px-6 py-4 text-center">
                Sl No
              </th>

              <th className="px-6 py-4 text-left">
                Customer Name
              </th>

              <th className="px-6 py-4 text-center">
                Status
              </th>

              <th className="px-6 py-4 text-center">
                Created On
              </th>

              <th className="px-6 py-4 text-center">
                Actions
              </th>

            </tr>

          </thead>

          <tbody>

            {customers.length === 0 ? (

              <tr>

                <td
                  colSpan={5}
                  className="py-12 text-center text-gray-500"
                >
                  No Customers Found
                </td>

              </tr>

            ) : (

              customers.map((customer, index) => (

                <CustomerRow
                  key={customer.id}
                  customer={customer}
                  index={index}
                  customers={customers}
                  setCustomers={setCustomers}
                />

              ))

            )}

          </tbody>

        </table>

      </div>

    </div>
  );
};

export default CustomerTable;