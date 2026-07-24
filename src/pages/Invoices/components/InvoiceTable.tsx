import { useState } from "react";
import { FileText } from "lucide-react";

import type { Invoice } from "../../../types/Invoice";

import {
  getInvoices,
  deleteInvoice,
} from "../../../services/invoiceService";

import InvoiceRow from "./InvoiceRow";
import { EmptyState } from "../../../components/ui/EmptyState";

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

        <EmptyState
          icon={<FileText size={20} />}
          title="No Invoices Found"
          description='Click "Add Invoice" to create your first invoice.'
        />

      ) : (

        <div className="overflow-x-auto rounded-xl border border-gray-200">

          <table className="min-w-full">

            <thead>

              <tr className="text-sm text-slate-700">

                <th className="nu-table-th p-4 text-left sticky top-0 left-0 z-30">
                  PR No
                </th>

                <th className="nu-table-th p-4 text-left sticky top-0 z-20">
                  Invoice Ref
                </th>

                <th className="nu-table-th p-4 text-left sticky top-0 z-20">
                  Client
                </th>

                <th className="nu-table-th p-4 text-left sticky top-0 z-20">
                  Invoice Date
                </th>

                <th className="nu-table-th p-4 text-left sticky top-0 z-20">
                  Due Date
                </th>

                <th className="nu-table-th p-4 text-right sticky top-0 z-20">
                  Invoice Amount
                </th>

                <th className="nu-table-th p-4 text-right sticky top-0 z-20">
                  Received
                </th>

                <th className="nu-table-th p-4 text-right sticky top-0 z-20">
                  Outstanding
                </th>

                <th className="nu-table-th p-4 text-center sticky top-0 z-20">
                  Status
                </th>

                <th className="nu-table-th p-4 text-center sticky top-0 z-20">
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
