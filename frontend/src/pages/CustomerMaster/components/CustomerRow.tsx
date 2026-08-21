import { Pencil, Trash2 } from "lucide-react";
import type { Customer } from "../../../types/CustomerModel";
import { Badge } from "../../../components/ui/Badge";

interface Props {
  customer: Customer;
  index: number;
  onEdit: (customer: Customer) => void;
  onDelete: (customer: Customer) => void;
  canMutate?: boolean;
}

const CustomerRow = ({ customer, index, onEdit, onDelete, canMutate = true }: Props) => {
  return (
    <tr
      className={`border-b border-[var(--nu-border)] last:border-none hover:bg-[var(--nu-accent-soft)] transition-colors ${
        index % 2 === 1 ? "bg-[var(--nu-surface-alt)]" : "bg-[var(--nu-surface)]"
      }`}
    >
      <td className="px-4 py-3 text-center text-[12px] font-medium text-[var(--nu-text-secondary)]">{index + 1}</td>
      <td className="px-4 py-3">
        <p className="text-[12.5px] font-medium text-[var(--nu-text)] leading-snug break-words">{customer.customerName}</p>
        {customer.companyName && (
          <p className="text-[11px] text-[var(--nu-text-muted)] leading-snug break-words">{customer.companyName}</p>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        <Badge tone={customer.status === "Active" ? "success" : "neutral"} dot>
          {customer.status}
        </Badge>
      </td>
      <td className="px-4 py-3 text-center text-[12px] text-[var(--nu-text-secondary)]">
        {new Date(customer.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
      </td>
      {canMutate && (
        <td className="px-4 py-3">
          <div className="flex items-center justify-center gap-2">
            <button
              title="Edit Customer"
              onClick={() => onEdit(customer)}
              className="w-9 h-9 rounded-[var(--nu-radius-md)] bg-[var(--nu-accent-soft)] text-[var(--nu-accent)] flex items-center justify-center hover:shadow-[var(--nu-shadow-md)] hover:-translate-y-0.5 transition-all duration-150"
            >
              <Pencil size={15} />
            </button>
            <button
              title="Delete Customer"
              onClick={() => onDelete(customer)}
              className="w-9 h-9 rounded-[var(--nu-radius-md)] bg-[var(--nu-danger-soft)] text-[var(--nu-danger)] flex items-center justify-center hover:shadow-[var(--nu-shadow-md)] hover:-translate-y-0.5 transition-all duration-150"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </td>
      )}
    </tr>
  );
};

export default CustomerRow;
