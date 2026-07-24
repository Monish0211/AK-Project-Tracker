import { useState } from "react";

import type { Dispatch, SetStateAction } from "react";
import type { Employee } from "../../../types/EmployeeModel";

import { deleteEmployee } from "../../../services/employeeService";

import EmployeeRow from "./EmployeeRow";
import EmployeeModal from "./EmployeeModal";
import { EmptyStateRow } from "../../../components/ui/EmptyStateRow";

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
      <div className="bg-white dark:bg-[#1E293B] rounded-2xl shadow-md border border-gray-100 dark:border-slate-800 overflow-hidden">

        <div className="overflow-x-auto">

          <table className="w-full min-w-[1200px] border-collapse">

            <thead>

              <tr>

                <th className="nu-table-th px-6 py-4 text-center w-16">
                  Sl No
                </th>

                <th className="nu-table-th px-6 py-4 text-left w-32">
                  Employee No
                </th>

                <th className="nu-table-th px-6 py-4 text-left">
                  Employee Name
                </th>

                <th className="nu-table-th px-6 py-4 text-left">
                  Designation
                </th>

                <th className="nu-table-th px-6 py-4 text-left">
                  Department
                </th>

                <th className="nu-table-th px-6 py-4 text-left">
                  Location
                </th>

                <th className="nu-table-th px-6 py-4 text-left">
                  Reporting Manager
                </th>

                <th className="nu-table-th px-6 py-4 text-center w-28">
                  Employee Grade
                </th>

                <th className="nu-table-th px-6 py-4 text-right w-36">
                  Man-hour Expenses
                </th>

                <th className="nu-table-th px-6 py-4 text-center w-28">
                  Status
                </th>

                <th className="nu-table-th px-6 py-4 text-center w-32">
                  Action
                </th>

              </tr>

            </thead>

            <tbody>

              {employees.length === 0 ? (

                <EmptyStateRow colSpan={11} title="No Employees Found" />

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
