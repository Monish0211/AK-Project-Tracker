import { useState } from "react";

import type { Invoice } from "../../../types/Invoice";

import {
  getInvoices,
  deleteInvoice,
} from "../../../services/invoiceService";

import InvoiceRow from "./InvoiceRow";

const InvoiceTable = () => {
  const [invoices, setInvoices] = useState<Invoice[]>(
    getInvoices()
  );

  const handleDelete = (id: string) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this invoice?"
    );

    if (!confirmDelete) return;

    deleteInvoice(id);

    setInvoices(getInvoices());

    alert("Invoice deleted successfully!");
  };

  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">

      {/* Header */}

      <div className="flex justify-between items-center mb-6">

        <h2 className="text-2xl font-semibold text-slate-800">
          Invoice List
        </h2>

        <span className="text-sm text-gray-500">
          Total Invoices : {invoices.length}
        </span>

      </div>

      {invoices.length === 0 ? (

        <div className="py-16 text-center">

          <h3 className="text-xl font-semibold text-slate-700">
            No Invoices Found
          </h3>

          <p className="mt-2 text-gray-500">
            Click "Add Invoice" to create your first invoice.
          </p>

        </div>

      ) : (

        <div className="overflow-x-auto rounded-xl border border-gray-200">

          <table className="min-w-full">

            <thead className="bg-slate-100">

              <tr className="text-sm text-slate-700">

                <th className="p-4 text-left">
                  PR No
                </th>

                <th className="p-4 text-left">
                  Invoice Ref
                </th>

                <th className="p-4 text-left">
                  Client
                </th>

                <th className="p-4 text-left">
                  Invoice Date
                </th>

                <th className="p-4 text-left">
                  Due Date
                </th>

                <th className="p-4 text-right">
                  Invoice Amount
                </th>

                <th className="p-4 text-right">
                  Received
                </th>

                <th className="p-4 text-right">
                  Outstanding
                </th>

                <th className="p-4 text-center">
                  Status
                </th>

                <th className="p-4 text-center">
                  Actions
                </th>

              </tr>

            </thead>

            <tbody>

              {invoices.map((invoice) => (

                <InvoiceRow
                  key={invoice.id}
                  invoice={invoice}
                  onDelete={handleDelete}
                />

              ))}

            </tbody>

          </table>

        </div>

      )}

    </div>
  );
};

export default InvoiceTable;