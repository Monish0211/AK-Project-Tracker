import { useState } from "react";
import { X } from "lucide-react";

import { addCustomer, getCustomers } from "../../../services/customerService";

import type { Customer } from "../../../types/CustomerModel";

interface Props {
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  onClose: () => void;
}

const CustomerModal = ({
  setCustomers,
  onClose,
}: Props) => {
  const [customerName, setCustomerName] = useState("");
  const [error, setError] = useState("");

  const handleSave = () => {
    if (!customerName.trim()) {
      setError("Customer Name is required.");
      return;
    }

    const success = addCustomer(customerName.trim());

    if (!success) {
      setError("Customer already exists.");
      return;
    }

    setCustomers(getCustomers());

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">

        {/* Header */}

        <div className="flex items-center justify-between border-b p-6">
          <div>
            <h2 className="text-2xl font-bold">
              Add Customer
            </h2>

            <p className="text-gray-500 mt-1">
              Create a new customer.
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}

        <div className="p-6">

          <label className="block text-sm font-medium mb-2">
            Customer Name
          </label>

          <input
            type="text"
            value={customerName}
            onChange={(e) => {
              setCustomerName(e.target.value);
              setError("");
            }}
            placeholder="Enter Customer Name"
            className="w-full border rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none"
          />

          {error && (
            <p className="text-red-600 text-sm mt-3">
              {error}
            </p>
          )}

        </div>

        {/* Footer */}

        <div className="flex justify-end gap-3 border-t p-6">

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl border hover:bg-gray-100"
          >
            Cancel
          </button>

          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700"
          >
            Save Customer
          </button>

        </div>

      </div>
    </div>
  );
};

export default CustomerModal;