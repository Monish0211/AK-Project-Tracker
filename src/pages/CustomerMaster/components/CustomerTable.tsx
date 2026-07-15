import type { Customer } from "../../../types/CustomerModel";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Users } from "lucide-react";
import CustomerRow from "./CustomerRow";

interface Props {
  customers: Customer[];
  onEdit: (customer: Customer) => void;
  onDelete: (customer: Customer) => void;
}

const CustomerTable = ({ customers, onEdit, onDelete }: Props) => {
  return (
    <div className="max-h-[560px] overflow-auto nu-scrollbar">
      {customers.length === 0 ? (
        <EmptyState
          icon={<Users size={18} />}
          title="No customers found"
          description="Try adjusting your search or status filter."
        />
      ) : (
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[var(--nu-surface-alt)] text-[10.5px] uppercase tracking-wide text-[var(--nu-text-muted)] border-b border-[var(--nu-border)]">
              <th className="px-4 py-2.5 text-center font-medium w-14">Sl No</th>
              <th className="px-4 py-2.5 text-left font-medium">Customer Name</th>
              <th className="px-4 py-2.5 text-center font-medium w-32">Status</th>
              <th className="px-4 py-2.5 text-center font-medium w-32">Created On</th>
              <th className="px-4 py-2.5 text-center font-medium w-28">Actions</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer, index) => (
              <CustomerRow key={customer.id} customer={customer} index={index} onEdit={onEdit} onDelete={onDelete} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default CustomerTable;
