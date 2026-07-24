import { Eye, Pencil, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import type { Invoice } from "../../../types/Invoice";

interface Props {
  invoice: Invoice;
  onDelete: (id: string) => void;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case "Paid":
      return "bg-green-100 text-green-700";

    case "Partially Paid":
      return "bg-yellow-100 text-yellow-700";

    case "Raised":
      return "bg-blue-100 text-blue-700";

    case "Overdue":
      return "bg-red-100 text-red-700";

    case "Cancelled":
      return "bg-gray-100 text-gray-700 dark:text-slate-200";

    default:
      return "bg-gray-100 text-gray-700 dark:text-slate-200";
  }
};

const InvoiceRow = ({
  invoice,
  onDelete,
}: Props) => {
  const navigate = useNavigate();

  return (
    <tr className="nu-table-row">

      <td className="p-3 sticky left-0 z-10 bg-white dark:bg-[#1E293B]">{invoice.prNo}</td>

      <td className="p-3 font-medium">
        {invoice.invoiceRef}
      </td>

      <td className="p-3">
        {invoice.client}
      </td>

      <td className="p-3">
        {invoice.invoiceDate}
      </td>

      <td className="p-3">
        {invoice.dueDate}
      </td>

      <td className="p-3 text-right font-medium">
        ₹ {invoice.invoiceAmount.toLocaleString("en-IN")}
      </td>

      <td className="p-3 text-right text-green-700 font-medium">
        ₹ {invoice.receivedAmount.toLocaleString("en-IN")}
      </td>

      <td className="p-3 text-right text-red-600 font-medium">
        ₹ {invoice.outstandingAmount.toLocaleString("en-IN")}
      </td>

      <td className="p-3 text-center">

        <span
          className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(
            invoice.status
          )}`}
        >
          {invoice.status}
        </span>

      </td>

      <td className="p-3">

        <div className="flex justify-center gap-4">

          <button
            title="View Invoice"
            onClick={() =>
              navigate(`/invoices/view/${invoice.id}`)
            }
            className="text-blue-600 hover:text-blue-800"
          >
            <Eye size={18} />
          </button>

          <button
            title="Edit Invoice"
            onClick={() =>
              navigate(`/invoices/edit/${invoice.id}`)
            }
            className="text-green-600 hover:text-green-800"
          >
            <Pencil size={18} />
          </button>

          <button
            title="Delete Invoice"
            onClick={() => onDelete(invoice.id)}
            className="text-red-600 hover:text-red-800"
          >
            <Trash2 size={18} />
          </button>

        </div>

      </td>

    </tr>
  );
};

export default InvoiceRow;