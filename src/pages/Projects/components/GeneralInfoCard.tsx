import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Project } from "../../../types/Project";
import { getCustomers } from "../../../services/customerService";
import { getEmployees } from "../../../services/employeeService";
import React from "react";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
}

interface AutocompleteInputProps {
  value: string;
  onChange: (val: string) => void;
  suggestionsList: string[];
  placeholder: string;
  required?: boolean;
}

const AutocompleteInput = ({
  value,
  onChange,
  suggestionsList,
  placeholder,
  required,
}: AutocompleteInputProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getFilteredSuggestions = (val: string) => {
    if (!val.trim()) {
      return suggestionsList;
    }
    return suggestionsList.filter((name) =>
      name.toLowerCase().includes(val.toLowerCase())
    );
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
    const filtered = getFilteredSuggestions(val);
    setSuggestions(filtered);
    setIsOpen(true);
  };

  const handleFocus = () => {
    const filtered = getFilteredSuggestions(value);
    setSuggestions(filtered);
    setIsOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        required={required}
        className="w-full border border-gray-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
      />
      {isOpen && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {suggestions.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                onChange(name);
                setIsOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-blue-50 transition-colors duration-100"
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const prCategories = [
  "Malaysia",
  "Oman",
  "Abu Dhabi",
  "FZI",
  "Elixir Qatar",
  "India",
  "Qatar",
];

const departmentOptions = [
  "Design Engineering Services",
  "Environment",
  "Risk Management",
  "Training",
];

const prNumberPrefixMap: Record<string, string> = {
  Malaysia: "MYPR-",
  Oman: "EE-",
  "Abu Dhabi": "PRAD-",
  FZI: "PRI-",
  "Elixir Qatar": "EE-Q-",
  India: "PR-",
  Qatar: "Q-PR-",
};

const applyPrNoPrefix = (rawValue: string, prefix: string) => {
  if (!prefix) {
    return rawValue;
  }

  for (let matchLength = Math.min(prefix.length, rawValue.length); matchLength >= 0; matchLength--) {
    if (rawValue.slice(0, matchLength) === prefix.slice(0, matchLength)) {
      return prefix + rawValue.slice(matchLength);
    }
  }

  return prefix + rawValue;
};

const GeneralInfoCard = ({ project, setProject }: Props) => {
  const masterEmployees = getEmployees();
  const reportingManagers = useMemo(() => {
    return Array.from(
      new Set(
        masterEmployees
          .map((emp) => emp.reportingManager?.trim())
          .filter((name): name is string => typeof name === "string" && name !== "")
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [masterEmployees]);

  const clientDropdownRef = useRef<HTMLDivElement>(null);
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [isOtherDepartment, setIsOtherDepartment] = useState(
    Boolean(project.department && !departmentOptions.includes(project.department))
  );

  const customers = useMemo(() => getCustomers(), []);

  const filteredCustomers = useMemo(() => {
    const input = project.client || "";

    if (!input.trim()) {
      return [];
    }

    return customers
      .filter((customer) =>
        customer.customerName.toLowerCase().includes(input.toLowerCase())
      )
      .slice(0, 8);
  }, [customers, project.client]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        clientDropdownRef.current &&
        !clientDropdownRef.current.contains(event.target as Node)
      ) {
        setIsClientDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <h2 className="text-2xl font-semibold mb-6">
        General Information
      </h2>

      <div className="grid grid-cols-2 gap-6">

        {/* PO Month */}
        <div>
          <label className="block text-sm font-medium mb-2">
            PO Month
          </label>

          <input
            type="month"
            value={project.poMonth}
            onChange={(e) =>
              setProject({
                ...project,
                poMonth: e.target.value,
              })
            }
            className="w-full border rounded-lg p-3"
          />
        </div>

        {/* PR Category */}
        <div>
          <label className="block text-sm font-medium mb-2">
            PR Category
          </label>

          <select
            value={project.prCategory}
            onChange={(e) => {
              const newCategory = e.target.value;
              const oldPrefix = prNumberPrefixMap[project.prCategory] || "";
              const newPrefix = prNumberPrefixMap[newCategory] || "";

              const numberPart = project.prNo.startsWith(oldPrefix)
                ? project.prNo.slice(oldPrefix.length)
                : project.prNo;

              setProject({
                ...project,
                prCategory: newCategory,
                prNo: newPrefix + numberPart,
              });
            }}
            className="w-full border rounded-lg p-3"
          >
            <option value="">Select PR Category</option>

            {prCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        {/* PR Number */}
        <div>
          <label className="block text-sm font-medium mb-2">
            PR Number
          </label>

          <input
            type="text"
            value={project.prNo}
            onChange={(e) => {
              const prefix = prNumberPrefixMap[project.prCategory] || "";

              setProject({
                ...project,
                prNo: applyPrNoPrefix(e.target.value, prefix),
              });
            }}
            className="w-full border rounded-lg p-3"
            placeholder={
              prNumberPrefixMap[project.prCategory]
                ? `${prNumberPrefixMap[project.prCategory]}Enter Number`
                : "Enter PR Number"
            }
          />
        </div>

        {/* Client */}
        <div className="relative" ref={clientDropdownRef}>
          <label className="block text-sm font-medium mb-2">
            Client Name
          </label>

          <input
            type="text"
            value={project.client}
            onChange={(e) => {
              setProject({
                ...project,
                client: e.target.value,
              });
              setIsClientDropdownOpen(true);
            }}
            onFocus={() => setIsClientDropdownOpen(true)}
            className="w-full border rounded-lg p-3"
            placeholder="Enter Client Name"
          />

          {isClientDropdownOpen && filteredCustomers.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white rounded-lg shadow-lg border max-h-60 overflow-y-auto">
              {filteredCustomers.map((customer) => (
                <button
                  key={customer.customerName}
                  type="button"
                  className="w-full text-left p-3 hover:bg-blue-50"
                  onClick={() => {
                    setProject({
                      ...project,
                      client: customer.customerName,
                    });
                    setIsClientDropdownOpen(false);
                  }}
                >
                  {customer.customerName}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Department */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Department
          </label>

          <select
            value={isOtherDepartment ? "Others" : project.department}
            onChange={(e) => {
              if (e.target.value === "Others") {
                setIsOtherDepartment(true);
                return;
              }

              setIsOtherDepartment(false);
              setProject({
                ...project,
                department: e.target.value,
              });
            }}
            className="w-full border rounded-lg p-3"
          >
            <option value="">Select Department</option>
            {departmentOptions.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
            <option value="Others">Others</option>
          </select>

          {isOtherDepartment && (
            <div className="mt-2">
              <label className="block text-sm font-medium mb-2">
                Other Department
              </label>

              <input
                type="text"
                value={project.department}
                onChange={(e) =>
                  setProject({
                    ...project,
                    department: e.target.value,
                  })
                }
                className="w-full border rounded-lg p-3"
                placeholder="Enter Department"
              />
            </div>
          )}
        </div>

        {/* Domestic / Foreign */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Domestic / Foreign
          </label>

          <select
            value={project.domesticForeign}
            onChange={(e) =>
              setProject({
                ...project,
                domesticForeign: e.target.value,
              })
            }
            className="w-full border rounded-lg p-3"
          >
            <option value="">Select</option>
            <option value="Domestic">Domestic</option>
            <option value="Foreign">Foreign</option>
          </select>
        </div>

        {/* Project Title */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Project Title
          </label>

          <input
            type="text"
            value={project.projectTitle}
            onChange={(e) =>
              setProject({
                ...project,
                projectTitle: e.target.value,
              })
            }
            className="w-full border rounded-lg p-3"
            placeholder="Enter Project Title"
          />
        </div>

        {/* Work Order Status */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Work Order Status
          </label>

          <select
            value={project.workOrderStatus}
            onChange={(e) =>
              setProject({
                ...project,
                workOrderStatus: e.target.value,
              })
            }
            className="w-full border rounded-lg p-3"
          >
            <option value="">Select</option>
            <option value="Received">Received</option>
            <option value="Pending">Pending</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>

        {/* Project Start Date */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Project Start Date
          </label>

          <input
            type="date"
            value={project.projectStartDate}
            onChange={(e) =>
              setProject({
                ...project,
                projectStartDate: e.target.value,
              })
            }
            className="w-full border rounded-lg p-3"
          />
        </div>

        {/* Project End Date */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Project End Date
          </label>

          <input
            type="date"
            value={project.projectEndDate}
            onChange={(e) =>
              setProject({
                ...project,
                projectEndDate: e.target.value,
              })
            }
            className="w-full border rounded-lg p-3"
          />
        </div>

        {/* Contract Type */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Contract Type
          </label>

          <select
            value={project.contractType || "LUMP SUM"}
            onChange={(e) =>
              setProject({
                ...project,
                contractType: e.target.value,
              })
            }
            className="w-full border rounded-lg p-3"
          >
            <option value="LUMP SUM">LUMP SUM</option>
            <option value="ARC">ARC</option>
          </select>
        </div>

        {/* Project Status */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Project Status
          </label>

          <select
            value={project.projectStatus}
            onChange={(e) =>
              setProject({
                ...project,
                projectStatus: e.target.value,
              })
            }
            className="w-full border rounded-lg p-3"
          >
            <option value="">Select</option>
            <option value="Active">Active</option>
            <option value="Completed">Completed</option>
            <option value="On Hold">On Hold</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>

      </div>

      {/* ================= Assigned Team Managers ================= */}
      <div className="border-t border-slate-100 mt-6 pt-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">
          Assigned Team Managers
        </h3>

        <div className="grid grid-cols-2 gap-6">
          {/* Primary Team Manager */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Primary Team Manager <span className="text-red-500">*</span>
            </label>
            <AutocompleteInput
              value={project.primaryProjectManager}
              onChange={(val) =>
                setProject((prev) => ({
                  ...prev,
                  primaryProjectManager: val,
                }))
              }
              suggestionsList={reportingManagers}
              placeholder="Search or enter Primary Team Manager"
              required
            />
          </div>

          {/* Secondary Team Manager */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Secondary Team Manager
            </label>
            <AutocompleteInput
              value={project.secondaryProjectManager}
              onChange={(val) =>
                setProject((prev) => ({
                  ...prev,
                  secondaryProjectManager: val,
                }))
              }
              suggestionsList={reportingManagers}
              placeholder="Search or enter Secondary Team Manager (Optional)"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeneralInfoCard;