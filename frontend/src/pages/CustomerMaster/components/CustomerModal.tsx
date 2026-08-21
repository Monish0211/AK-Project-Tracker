import { useState, useEffect } from "react";
import { X } from "lucide-react";

import { addCustomer, updateCustomer } from "../../../services/customerService";
import type { CustomerInput } from "../../../services/customerService";
import type { Customer } from "../../../types/CustomerModel";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { Button } from "../../../components/ui/Button";

interface Props {
  mode: "add" | "edit";
  customer?: Customer;
  onClose: () => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CustomerModal = ({ mode, customer, onClose }: Props) => {
  useEffect(() => {
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, []);

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
  const [saving, setSaving] = useState(false);

  const update = (field: keyof CustomerInput, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const handleSave = async () => {
    if (!form.customerName.trim()) {
      setError("Customer Name is required.");
      return;
    }

    if (form.email && !EMAIL_PATTERN.test(form.email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }

    setSaving(true);
    try {
      const result =
        mode === "edit" && customer ? await updateCustomer(customer.id, form) : await addCustomer(form);

      if (!result.success) {
        setError(result.message || "Unable to save customer.");
        return;
      }

      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-[#161d2c] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-gray-100 dark:border-slate-700 p-5 sm:p-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100">
              {mode === "add" ? "Add Customer" : "Edit Customer"}
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 mt-0.5">
              {mode === "add" ? "Create a new customer organization." : "Update customer organization details."}
            </p>
          </div>

          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer">
            <X size={20} className="text-slate-600 dark:text-slate-300" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-5 custom-scrollbar">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">
              Customer Name <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              value={form.customerName}
              onChange={(e) => update("customerName", e.target.value)}
              placeholder="Enter Customer Name"
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">Customer ID</label>
            <Input
              type="text"
              value={form.customerId}
              onChange={(e) => update("customerId", e.target.value)}
              placeholder="Optional"
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">Company Name</label>
            <Input
              type="text"
              value={form.companyName}
              onChange={(e) => update("companyName", e.target.value)}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">Country</label>
            <Input
              type="text"
              value={form.country}
              onChange={(e) => update("country", e.target.value)}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">Contact Person</label>
            <Input
              type="text"
              value={form.contactPerson}
              onChange={(e) => update("contactPerson", e.target.value)}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">Email</label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">Phone</label>
            <Input
              type="text"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">Status</label>
            <Select
              value={form.status}
              onChange={(e) => update("status", e.target.value as Customer["status"])}
              className="w-full"
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </Select>
          </div>

          {error && (
            <p className="text-red-600 text-sm sm:col-span-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t border-gray-100 dark:border-slate-700 p-4 sm:p-5 bg-white dark:bg-[#161d2c]">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>

          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : mode === "add" ? "Save Customer" : "Update Customer"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CustomerModal;
