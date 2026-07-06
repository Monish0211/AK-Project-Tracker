import { Pencil, Trash2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

import type { Customer } from "../../../types/CustomerModel";
import {
  deleteCustomer,
  saveCustomers,
} from "../../../services/customerService";

interface Props {
  customer: Customer;
  index: number;
  customers: Customer[];
  setCustomers: Dispatch<SetStateAction<Customer[]>>;
}

const CustomerRow = ({
  customer,
  index,
  customers,
  setCustomers,
}: Props) => {
  const handleEdit = () => {
    const newName = prompt(
      "Edit Customer Name",
      customer.customerName
    );

    if (!newName) return;

    const updated = customers.map((c) =>
      c.id === customer.id
        ? {
            ...c,
            customerName: newName.trim(),
          }
        : c
    );

    saveCustomers(updated);
    setCustomers(updated);
  };

  const handleDelete = () => {
    if (
      !window.confirm(
        `Delete "${customer.customerName}" ?`
      )
    ) {
      return;
    }

    deleteCustomer(customer.id);

    setCustomers(
      customers.filter((c) => c.id !== customer.id)
    );
  };

  return (
    <tr className="border-b hover:bg-slate-50 transition">

      {/* Sl No */}

      <td className="px-6 py-4 text-center font-medium text-slate-600">
        {index + 1}
      </td>

      {/* Customer Name */}

      <td className="px-6 py-4">
        <div className="font-medium text-slate-800">
          {customer.customerName}
        </div>
      </td>

      {/* Status */}

      <td className="px-6 py-4 text-center">

        <span
          className={`
            inline-flex
            items-center
            px-3
            py-1
            rounded-full
            text-xs
            font-semibold
            ${
              customer.status === "Active"
                ? "bg-green-100 text-green-700"
                : "bg-gray-100 text-gray-600"
            }
          `}
        >
          {customer.status}
        </span>

      </td>

      {/* Created On */}

      <td className="px-6 py-4 text-center text-slate-600">

        {new Date(customer.createdAt).toLocaleDateString(
          "en-IN",
          {
            day: "2-digit",
            month: "short",
            year: "numeric",
          }
        )}

      </td>

      {/* Actions */}

      <td className="px-6 py-4">

        <div className="flex justify-center gap-2">

          <button
            title="Edit Customer"
            onClick={handleEdit}
            className="
              w-9
              h-9
              rounded-lg
              bg-blue-50
              hover:bg-blue-100
              text-blue-600
              flex
              items-center
              justify-center
              transition
            "
          >
            <Pencil size={18} />
          </button>

          <button
            title="Delete Customer"
            onClick={handleDelete}
            className="
              w-9
              h-9
              rounded-lg
              bg-red-50
              hover:bg-red-100
              text-red-600
              flex
              items-center
              justify-center
              transition
            "
          >
            <Trash2 size={18} />
          </button>

        </div>

      </td>

    </tr>
  );
};

export default CustomerRow;