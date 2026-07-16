import { ClipboardList, Receipt } from "lucide-react";

import type { Project } from "../../../../types/Project";

import { getProjectCommercialSummary } from "../../../../services/invoiceProgressService";
import { formatIndianCurrency } from "../../../../utils/quantityCalculations";
import { Card, CardBody, CardHeader } from "../../../../components/ui/Card";
import { EmptyState } from "../../../../components/ui/EmptyState";

import InvoiceProgressRow from "./InvoiceProgressRow";

interface Props {
  project: Project;
}

const InvoiceProgressTable = ({ project }: Props) => {
  const items = project.invoiceItems;

  // Single source of truth — must always match the top KPI cards
  // (InvoiceSummaryCards), Project Repository and Dashboard.
  const summary = getProjectCommercialSummary(project);
  const totalWorkPackageValue = summary.projectValueINR;
  const totalInvoiceRaised = summary.totalInvoiceRaised;
  const balanceRemaining = summary.pendingDue;
  const completionPercentage = summary.invoiceCompletionPercent;
  const balancePercentage = 100 - completionPercentage;

  return (
    <div className="space-y-3.5">
      <Card padded={false}>
        <CardHeader icon={<Receipt size={16} />} title="Work Package Invoice Progress" subtitle="Invoice raised per work package" />

        {items.length === 0 ? (
          <CardBody>
            <EmptyState
              icon={<ClipboardList size={22} />}
              title="No Work Packages Added"
              description="Add activities in Quantity Details to start tracking invoice progress."
            />
          </CardBody>
        ) : (
          <div className="max-h-[30rem] overflow-auto nu-scrollbar">
            <table className="w-full min-w-[1150px] table-fixed border-collapse text-[13px]">
              <thead className="sticky top-0 z-10 bg-[var(--nu-surface-alt)] text-[11px] uppercase tracking-wide text-[var(--nu-text-muted)]">
                <tr>
                  <th className="w-14 border-b border-[var(--nu-border)] px-3 py-2.5 text-center font-semibold">S.No</th>
                  <th className="border-b border-[var(--nu-border)] px-3 py-2.5 text-left font-semibold">Description</th>
                  <th className="w-24 border-b border-[var(--nu-border)] px-3 py-2.5 text-right font-semibold">Qty</th>
                  <th className="w-28 border-b border-[var(--nu-border)] px-3 py-2.5 text-center font-semibold">UOM</th>
                  <th className="w-32 border-b border-[var(--nu-border)] px-3 py-2.5 text-right font-semibold">Unit Price</th>
                  <th className="w-36 border-b border-[var(--nu-border)] px-3 py-2.5 text-right font-semibold">Total Price</th>
                  <th className="w-36 border-b border-[var(--nu-border)] px-3 py-2.5 text-right font-semibold">Invoice Raised</th>
                  <th className="w-24 border-b border-[var(--nu-border)] px-3 py-2.5 text-right font-semibold">Invoice %</th>
                  <th className="w-24 border-b border-[var(--nu-border)] px-3 py-2.5 text-right font-semibold">Balance %</th>
                  <th className="w-36 border-b border-[var(--nu-border)] px-3 py-2.5 text-center font-semibold">Status</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[var(--nu-border)]">
                {items.map((item, index) => (
                  <InvoiceProgressRow key={item.id} item={item} index={index} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Bottom Summary — Excel-style invoice percentage sheet */}
      <Card>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
          <div>
            <p className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--nu-text-muted)]">Total Invoice Raised</p>
            <p className="mt-1 text-[16px] font-bold text-[var(--nu-accent)]">{formatIndianCurrency(totalInvoiceRaised)}</p>
          </div>

          <div>
            <p className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--nu-text-muted)]">Total Project Value</p>
            <p className="mt-1 text-[16px] font-bold text-[var(--nu-text)]">{formatIndianCurrency(totalWorkPackageValue)}</p>
          </div>

          <div>
            <p className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--nu-text-muted)]">Balance Remaining</p>
            <p className="mt-1 text-[16px] font-bold text-[var(--nu-warning)]">{formatIndianCurrency(balanceRemaining)}</p>
          </div>

          <div>
            <p className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--nu-text-muted)]">Balance %</p>
            <p className="mt-1 text-[16px] font-bold text-[var(--nu-warning)]">{balancePercentage.toFixed(2)}%</p>
          </div>

          <div>
            <p className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--nu-text-muted)]">Invoice Completion %</p>
            <p className="mt-1 text-[16px] font-bold text-[var(--nu-success)]">{completionPercentage.toFixed(2)}%</p>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default InvoiceProgressTable;
