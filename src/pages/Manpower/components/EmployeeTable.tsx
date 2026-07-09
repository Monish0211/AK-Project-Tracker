import { useState } from "react";

import type { Dispatch, SetStateAction } from "react";
import type { Employee } from "../../../types/EmployeeModel";

import { deleteEmployee } from "../../../services/employeeService";

import EmployeeRow from "./EmployeeRow";
import EmployeeModal from "./EmployeeModal";

interface Props {
  employees: Employee[];
  setEmployees: Dispatch<SetStateAction<Employee[]>>;
}

const EmployeeTable = ({
  employees,
  setEmployees,
}: Props) => {
  const [selectedEmployee, setSelectedEmployee] =
    useState<Employee | null>(null);

  const handleDelete = (id: string) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this employee?"
      )
    ) {
      return;
    }

    deleteEmployee(id);

    setEmployees((prev) =>
      prev.filter((employee) => employee.id !== id)
    );
  };

  const handleEdit = (employee: Employee) => {
    setSelectedEmployee(employee);
  };

  return (
    <>
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">

        <div className="overflow-x-auto">

          <table className="w-full min-w-[1200px] border-collapse">

            <thead className="bg-slate-100 text-slate-600 text-sm font-semibold uppercase tracking-wide">

              <tr>

                <th className="px-6 py-4 text-center w-16">
                  Sl No
                </th>

                <th className="px-6 py-4 text-left w-32">
                  Employee No
                </th>

                <th className="px-6 py-4 text-left">
                  Employee Name
                </th>

                <th className="px-6 py-4 text-left">
                  Designation
                </th>

                <th className="px-6 py-4 text-left">
                  Department
                </th>

                <th className="px-6 py-4 text-left">
                  Location
                </th>

                <th className="px-6 py-4 text-left">
                  Reporting Manager
                </th>

                <th className="px-6 py-4 text-center w-28">
                  Employee Grade
                </th>

                <th className="px-6 py-4 text-right w-36">
                  Manhour Rate
                </th>

                <th className="px-6 py-4 text-center w-28">
                  Status
                </th>

                <th className="px-6 py-4 text-center w-32">
                  Action
                </th>

              </tr>

            </thead>

            <tbody>

              {employees.length === 0 ? (

                <tr>

                  <td
                    colSpan={11}
                    className="py-12 text-center text-gray-500"
                  >
                    No Employees Found
                  </td>

                </tr>

              ) : (

                employees.map((employee, index) => (

                  <EmployeeRow
                    key={employee.id}
                    index={index}
                    employee={employee}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />

                ))

              )}

            </tbody>

          </table>

        </div>

      </div>

      {selectedEmployee && (

        <EmployeeModal
          employee={selectedEmployee}
          employees={employees}
          setEmployees={setEmployees}
          onClose={() => setSelectedEmployee(null)}
        />

      )}

    </>
  );
};

export default EmployeeTable;