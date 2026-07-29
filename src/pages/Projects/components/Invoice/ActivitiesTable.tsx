import { useState } from "react";
import { ClipboardList, ListChecks } from "lucide-react";
import type { Project } from "../../../../types/Project";
import type { InvoiceItem } from "../../../../types/InvoiceItem";
import { Card, CardBody, CardHeader } from "../../../../components/ui/Card";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { ActivityRow } from "./ActivityRow";

interface Props {
  project: Project;
  readOnly?: boolean;
  onRaiseInvoice: (item: InvoiceItem) => void;
  onViewHistory: (item: InvoiceItem) => void;
}

/** Section 2 — one row per Quantity Details activity, always mirrored automatically (see services/invoiceSyncService.ts). */
export function ActivitiesTable({ project, readOnly = false, onRaiseInvoice, onViewHistory }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const items = project.invoiceItems ?? [];

  return (
    <Card padded={false}>
      <CardHeader
        icon={<ListChecks size={16} />}
        title="Activities Billing"
        subtitle="Every activity mirrors Quantity Details automatically"
      />

      {items.length === 0 ? (
        <CardBody>
          <EmptyState
            icon={<ClipboardList size={22} />}
            title="No Work Packages Added"
            description="Add activities in Quantity Details to enable invoicing."
          />
        </CardBody>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1160px] border-collapse text-[13px]">
            <thead>
              <tr>
                <th className="nu-table-th px-3 py-2.5 text-left">Activity</th>
                <th className="nu-table-th px-3 py-2.5 text-center">Billing Type</th>
                <th className="nu-table-th px-3 py-2.5 text-right">Contract Qty</th>
                <th className="nu-table-th px-3 py-2.5 text-right">Completed Qty</th>
                <th className="nu-table-th px-3 py-2.5 text-right">Remaining Qty</th>
                <th className="nu-table-th px-3 py-2.5 text-right">Contract Value</th>
                <th className="nu-table-th px-3 py-2.5 text-right">Invoice Raised</th>
                <th className="nu-table-th px-3 py-2.5 text-right">Balance Value</th>
                <th className="nu-table-th px-3 py-2.5 text-center">Status</th>
                <th className="nu-table-th px-3 py-2.5 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <ActivityRow
                  key={item.id}
                  project={project}
                  item={item}
                  readOnly={readOnly}
                  isExpanded={expandedId === item.id}
                  onToggleExpand={() => setExpandedId((prev) => (prev === item.id ? null : item.id))}
                  onRaiseInvoice={() => onRaiseInvoice(item)}
                  onViewHistory={() => onViewHistory(item)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
