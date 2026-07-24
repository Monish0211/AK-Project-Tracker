import { UserPlus } from "lucide-react";
import type { Customer } from "../../../types/CustomerModel";
import { Card, CardHeader, CardBody } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";

interface Props {
  customers: Customer[];
}

const RecentCustomersPanel = ({ customers }: Props) => {
  const recent = [...customers]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  return (
    <Card padded={false} elevated className="h-full flex flex-col">
      <CardHeader icon={<UserPlus size={15} />} title="Recently Added" subtitle="Latest customer records" />
      <CardBody className="flex-1 overflow-auto nu-scrollbar">
        {recent.length === 0 ? (
          <EmptyState icon={<UserPlus size={18} />} title="No customers yet" description="New customers will appear here first." />
        ) : (
          <ul className="space-y-2.5">
            {recent.map((customer) => (
              <li key={customer.id} className="flex items-center justify-between gap-2 rounded-[var(--nu-radius-md)] px-2 py-1.5 hover:bg-[var(--nu-surface-alt)] transition-colors">
                <div className="min-w-0">
                  <p className="text-[12.5px] font-medium text-[var(--nu-text)] truncate">{customer.customerName}</p>
                  {customer.companyName && (
                    <p className="text-[10.5px] text-[var(--nu-text-muted)] truncate">{customer.companyName}</p>
                  )}
                </div>
                <span className="text-[10.5px] text-[var(--nu-text-muted)] shrink-0">
                  {new Date(customer.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
};

export default RecentCustomersPanel;
