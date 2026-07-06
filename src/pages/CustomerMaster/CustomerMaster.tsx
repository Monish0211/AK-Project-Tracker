// src/pages/CustomerMaster/CustomerMaster.tsx
import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  Users,
  Plus,
  Upload,
  Download,
  UserCheck,
  UserX,
  CalendarDays,
} from "lucide-react";

import type { Customer } from "../../types/CustomerModel";

import {
  getCustomers,
  importCustomersFromExcel,
  exportCustomersToExcel,
} from "../../services/customerService";

import CustomerFilter from "./components/CustomerFilter";
import CustomerTable from "./components/CustomerTable";
import CustomerModal from "./components/CustomerModal";

const CustomerMaster = () => {
  const [customers, setCustomers] = useState<Customer[]>(getCustomers());

  const [search, setSearch] = useState("");

  const [showModal, setShowModal] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredCustomers = customers.filter((customer) =>
    customer.customerName
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const totalCustomers = customers.length;

  const activeCustomers = customers.filter(
    (customer) => customer.status === "Active"
  ).length;

  const inactiveCustomers = customers.filter(
    (customer) => customer.status === "Inactive"
  ).length;

  const today = new Date().toDateString();

  const addedToday = customers.filter(
    (customer) =>
      new Date(customer.createdAt).toDateString() === today
  ).length;

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) return;

    try {
      const { imported, skipped } = await importCustomersFromExcel(file);

      setCustomers(getCustomers());

      alert(`Imported ${imported} Customers\nSkipped ${skipped} Duplicates`);
    } catch {
  alert("Failed to import Excel file. Please check the file format.");
}
  };

  const handleExportClick = () => {
    exportCustomersToExcel(customers);
  };

  return (
    <div className="space-y-6">

      {/* Hidden Import File Input */}

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Header */}

      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">

        <div className="flex items-center justify-between">

          <div className="flex items-center gap-4">

            <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center">

              <Users
                size={28}
                className="text-blue-600"
              />

            </div>

            <div>

              <h1 className="text-3xl font-bold text-slate-800">
                Customer Master
              </h1>

              <p className="text-gray-500 mt-1">
                Manage all customer records used across the PMO Portal.
              </p>

            </div>

          </div>

          <div className="flex gap-3">

            <button
              onClick={handleImportClick}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-green-600 text-white hover:bg-green-700 transition"
            >
              <Upload size={18} />
              Import Excel
            </button>

            <button
              onClick={handleExportClick}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition"
            >
              <Download size={18} />
              Export Excel
            </button>

            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition"
            >
              <Plus size={18} />
              Add Customer
            </button>

          </div>

        </div>

      </div>

      {/* Statistics */}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">

        <div className="bg-white rounded-2xl border shadow-sm p-5">

          <div className="flex justify-between items-center">

            <div>

              <p className="text-sm text-gray-500">
                Total Customers
              </p>

              <h2 className="text-3xl font-bold text-slate-800 mt-2">
                {totalCustomers}
              </h2>

            </div>

            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">

              <Users className="text-blue-600" />

            </div>

          </div>

        </div>

        <div className="bg-white rounded-2xl border shadow-sm p-5">

          <div className="flex justify-between items-center">

            <div>

              <p className="text-sm text-gray-500">
                Active Customers
              </p>

              <h2 className="text-3xl font-bold text-green-600 mt-2">
                {activeCustomers}
              </h2>

            </div>

            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">

              <UserCheck className="text-green-600" />

            </div>

          </div>

        </div>

        <div className="bg-white rounded-2xl border shadow-sm p-5">

          <div className="flex justify-between items-center">

            <div>

              <p className="text-sm text-gray-500">
                Inactive Customers
              </p>

              <h2 className="text-3xl font-bold text-red-600 mt-2">
                {inactiveCustomers}
              </h2>

            </div>

            <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">

              <UserX className="text-red-600" />

            </div>

          </div>

        </div>

        <div className="bg-white rounded-2xl border shadow-sm p-5">

          <div className="flex justify-between items-center">

            <div>

              <p className="text-sm text-gray-500">
                Added Today
              </p>

              <h2 className="text-3xl font-bold text-purple-600 mt-2">
                {addedToday}
              </h2>

            </div>

            <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">

              <CalendarDays className="text-purple-600" />

            </div>

          </div>

        </div>

      </div>

      {/* Search */}

      <CustomerFilter
        search={search}
        setSearch={setSearch}
      />

      {/* Table */}

      <CustomerTable
        customers={filteredCustomers}
        setCustomers={setCustomers}
      />

      {/* Add Customer Modal */}

      {showModal && (
<CustomerModal
    setCustomers={setCustomers}
    onClose={() => setShowModal(false)}
/>
      )}

    </div>
  );
};

export default CustomerMaster;