import { useState } from "react";

import {
  Users,
  Plus,
  Upload,
  Download,
} from "lucide-react";

import type { Employee } from "../../types/EmployeeModel";

import {
  getEmployees,
  exportEmployeesToExcel,
  importEmployeesFromExcel,
  downloadEmployeeTemplate,
} from "../../services/employeeService";

import EmployeeFilter from "./components/EmployeeFilter";
import EmployeeTable from "./components/EmployeeTable";
import EmployeeModal from "./components/EmployeeModal";
import EmployeeImportModal from "./components/EmployeeImportModal";

const Manpower = () => {
  const [employees, setEmployees] = useState<Employee[]>(
    getEmployees()
  );

  const [search, setSearch] = useState("");

  const [showModal, setShowModal] = useState(false);

  const [showImportModal, setShowImportModal] = useState(false);

  const filteredEmployees = employees.filter((employee) => {
    const value = search.toLowerCase();

    return (
      employee.employeeNo.toLowerCase().includes(value) ||
      employee.employeeName.toLowerCase().includes(value) ||
      employee.reportingManager.toLowerCase().includes(value)
    );
  });

  const handleExport = () => {
    exportEmployeesToExcel(employees);
  };

  const handleDownloadTemplate = () => {
    downloadEmployeeTemplate();
  };

  const handleImport = async (file: File) => {
    try {
      const result = await importEmployeesFromExcel(file);

      setEmployees(getEmployees());

      alert(
        `Import Completed\n\nImported : ${result.imported}\nDuplicates : ${result.duplicates}\nInvalid : ${result.invalid}\nBlank : ${result.blank}`
      );

      setShowImportModal(false);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to import Excel file. Please check the file format.";

      alert(message);
    }
  };

  return (
    <div className="space-y-6">

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
                Manpower Master
              </h1>

              <p className="text-gray-500 mt-1">
                Manage employee master records used across the PMO Portal.
              </p>

            </div>

          </div>

          <div className="flex gap-3">

            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-green-600 text-white hover:bg-green-700 transition"
            >
              <Upload size={18} />
              Import Excel
            </button>

            <button
              onClick={handleExport}
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
              Add Employee
            </button>

          </div>

        </div>

      </div>

      {/* Search */}

      <EmployeeFilter
        search={search}
        setSearch={setSearch}
      />

      {/* Table */}

      <EmployeeTable
        employees={filteredEmployees}
        setEmployees={setEmployees}
      />

      {/* Add Employee Modal */}

      {showModal && (

        <EmployeeModal
          employees={employees}
          setEmployees={setEmployees}
          onClose={() => setShowModal(false)}
        />

      )}

      {/* Import Employee Modal */}

      {showImportModal && (

        <EmployeeImportModal
          onClose={() => setShowImportModal(false)}
          onImport={handleImport}
          onDownloadTemplate={handleDownloadTemplate}
        />

      )}

    </div>
  );
};

export default Manpower;
