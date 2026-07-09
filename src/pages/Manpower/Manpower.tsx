import { useState } from "react";

import {
  Users,
  Plus,
  Upload,
  Download,
  CheckCircle,
  Layers,
  IndianRupee,
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

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: "blue" | "green" | "purple" | "orange";
}

const ACCENT_STYLES: Record<
  KpiCardProps["accent"],
  { iconBg: string; iconText: string; valueText: string }
> = {
  blue: { iconBg: "bg-blue-50", iconText: "text-blue-600", valueText: "text-slate-800" },
  green: { iconBg: "bg-green-50", iconText: "text-green-600", valueText: "text-green-600" },
  purple: { iconBg: "bg-purple-50", iconText: "text-purple-600", valueText: "text-slate-800" },
  orange: { iconBg: "bg-orange-50", iconText: "text-orange-600", valueText: "text-slate-800" },
};

const KpiCard = ({ icon, label, value, accent }: KpiCardProps) => {
  const styles = ACCENT_STYLES[accent];

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${styles.iconBg} ${styles.iconText}`}>
        {icon}
      </div>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold ${styles.valueText}`}>{value}</p>
    </div>
  );
};

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
      (employee.employeeNo || "").toLowerCase().includes(value) ||
      (employee.employeeName || "").toLowerCase().includes(value) ||
      (employee.designation || "").toLowerCase().includes(value) ||
      (employee.department || "").toLowerCase().includes(value) ||
      (employee.reportingManager || "").toLowerCase().includes(value) ||
      (employee.location || "").toLowerCase().includes(value) ||
      (employee.grade || "").toLowerCase().includes(value)
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
        `Imported Successfully\n\nEmployees Added: ${result.added}\nEmployees Updated: ${result.updated}\nInvalid Rows: ${result.invalid}\nBlank Rows: ${result.blank}`
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

  // KPI Calculations
  const totalEmployees = employees.length;
  const activeEmployees = employees.filter((e) => e.status === "Active").length;
  const uniqueDepartments = Array.from(
    new Set(employees.map((e) => e.department).filter(Boolean))
  ).length;
  const averageRate = employees.length
    ? employees.reduce((sum, e) => sum + (e.manhourRate || 0), 0) / employees.length
    : 0;

  return (
    <div className="space-y-6">

      {/* Header */}

      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

          <div className="flex items-center gap-4">

            <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center shrink-0">

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

          <div className="flex flex-wrap gap-3">

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

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Users size={18} strokeWidth={2.25} />}
          label="Total Employees"
          value={String(totalEmployees)}
          accent="blue"
        />

        <KpiCard
          icon={<CheckCircle size={18} strokeWidth={2.25} />}
          label="Active Employees"
          value={String(activeEmployees)}
          accent="green"
        />

        <KpiCard
          icon={<Layers size={18} strokeWidth={2.25} />}
          label="Departments"
          value={String(uniqueDepartments)}
          accent="purple"
        />

        <KpiCard
          icon={<IndianRupee size={18} strokeWidth={2.25} />}
          label="Average Manhour Rate"
          value={`₹ ${averageRate.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
          accent="orange"
        />
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
