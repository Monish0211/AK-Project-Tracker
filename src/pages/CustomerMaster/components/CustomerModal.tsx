import { useState } from "react";
import { X } from "lucide-react";

import { addCustomer, updateCustomer } from "../../../services/customerService";
import type { CustomerInput } from "../../../services/customerService";
import type { Customer } from "../../../types/CustomerModel";

interface Props {
  mode: "add" | "edit";
  customer?: Customer;
  onClose: () => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CustomerModal = ({ mode, customer, onClose }: Props) => {
  const [form, setForm] = useState<CustomerInput>({
    customerId: customer?.customerId || "",
    customerName: customer?.customerName || "",
    companyName: customer?.companyName || "",
    country: customer?.country || "",
    contactPerson: customer?.contactPerson || "",
    email: customer?.email || "",
    phone: customer?.phone || "",
    status: customer?.status || "Active",
  });
  const [error, setError] = useState("");

  const update = (field: keyof CustomerInput, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const handleSave = () => {
    if (!form.customerName.trim()) {
      setError("Customer Name is required.");
      return;
    }

    if (form.email && !EMAIL_PATTERN.test(form.email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }

    const result =
      mode === "edit" && customer
        ? updateCustomer(customer.id, form)
        : addCustomer(form);

    if (!result.success) {
      setError(result.message || "Unable to save customer.");
      return;
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-[#161d2c] rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-700 p-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              {mode === "add" ? "Add Customer" : "Edit Customer"}
            </h2>
            <p className="text-gray-500 dark:text-slate-400 mt-1">
              {mode === "add" ? "Create a new customer organization." : "Update customer organization details."}
            </p>
          </div>

          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700">
            <X size={20} className="text-slate-600 dark:text-slate-300" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">
              Customer Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.customerName}
              onChange={(e) => update("customerName", e.target.value)}
              placeholder="Enter Customer Name"
              className="w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">Customer ID</label>
            <input
              type="text"
              value={form.customerId}
              onChange={(e) => update("customerId", e.target.value)}
              placeholder="Optional"
              className="w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">Company Name</label>
            <input
              type="text"
              value={form.companyName}
              onChange={(e) => update("companyName", e.target.value)}
              className="w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">Country</label>
            <input
              type="text"
              value={form.country}
              onChange={(e) => update("country", e.target.value)}
              className="w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">Contact Person</label>
            <input
              type="text"
              value={form.contactPerson}
              onChange={(e) => update("contactPerson", e.target.value)}
              className="w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              className="w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">Phone</label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              className="w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">Status</label>
            <select
              value={form.status}
              onChange={(e) => update("status", e.target.value as Customer["status"])}
              className="w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          {error && (
            <p className="text-red-600 text-sm sm:col-span-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-gray-100 dark:border-slate-700 p-6">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl border border-gray-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            Cancel
          </button>

          <button onClick={handleSave} className="px-5 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700">
            {mode === "add" ? "Save Customer" : "Update Customer"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomerModal;
