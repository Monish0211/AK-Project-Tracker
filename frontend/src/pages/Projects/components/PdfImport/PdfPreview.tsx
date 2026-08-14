import { CreditCard, FileSignature, Info, LayoutGrid, Package } from "lucide-react";
import type { ExtractedField, PdfImportResponse } from "../../../../types/PdfImport";
import { Card, CardBody, CardHeader } from "../../../../components/ui/Card";
import { ConfidenceBadge } from "./ConfidenceBadge";

interface Props {
  response: PdfImportResponse;
}

function formatDisplayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not Found";
  return String(value);
}

/**
 * Same visual language as InfoField.tsx (label/value read-only card) plus a
 * per-field ConfidenceBadge — kept local to this file rather than changing
 * InfoField.tsx itself, since InfoField has no slot for a badge and this
 * phase must not modify existing components.
 */
const PreviewField = ({ label, field }: { label: string; field: ExtractedField<unknown> }) => (
  <div className="bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-[var(--nu-radius-md)] p-3">
    <div className="flex items-center justify-between gap-2 mb-1">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">{label}</p>
      <ConfidenceBadge confidence={field.confidence} />
    </div>
    <p className="text-[13px] font-semibold text-[var(--nu-text)] truncate" title={formatDisplayValue(field.value)}>
      {formatDisplayValue(field.value)}
    </p>
  </div>
);

function formatCurrencyValue(value: number, currency: string): string {
  return `${currency} ${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Read-only preview of everything the (mock) extraction found, before Apply — never wired to project state directly; see pdfImportMapper.ts for the one place that actually happens. */
export const PdfPreview = ({ response }: Props) => {
  const gi = response.generalInformation;
  const currency = gi.currency.value || "INR";
  const hasQuantityRows = response.quantity.length > 0;
  const showLumpSumFallbackNote = !hasQuantityRows && !!gi.workOrderValue.value;

  return (
    <div className="space-y-3.5">
      <Card padded={false} elevated>
        <CardHeader icon={<LayoutGrid size={15} />} title="General Information" subtitle="Extracted from the uploaded document" />
        <CardBody className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <PreviewField label="PO Month" field={gi.poMonth} />
          <PreviewField label="PR Category" field={gi.prCategory} />
          <PreviewField label="Project Title" field={gi.projectTitle} />
          <PreviewField label="Client Name" field={gi.client} />
          <PreviewField label="Department" field={gi.department} />
          <PreviewField label="Domestic / Foreign" field={gi.domesticForeign} />
          <PreviewField label="Work Order Status" field={gi.workOrderStatus} />
          <PreviewField label="Project Status" field={gi.projectStatus} />
          <PreviewField label="Project Start Date" field={gi.projectStartDate} />
          <PreviewField label="Project End Date" field={gi.projectEndDate} />
          <PreviewField label="Estimated Duration" field={gi.estimatedDuration} />
          <PreviewField label="Duration Unit" field={gi.durationUnit} />
          <PreviewField label="Work Order Number" field={gi.workOrderNumber} />
          <PreviewField label="Work Order Date" field={gi.workOrderDate} />
          <PreviewField label="EIC Name" field={gi.eicName} />
          <PreviewField label="Contact Number" field={gi.contactNumber} />
          <PreviewField label="Email ID" field={gi.emailId} />
          <PreviewField label="Contract Type" field={gi.contractType} />
          <PreviewField label="PMO Coordinator" field={gi.pmoCoordinator} />
          <PreviewField label="Currency" field={gi.currency} />
        </CardBody>
      </Card>

      <Card padded={false} elevated>
        <CardHeader icon={<Package size={15} />} title="Quantity" subtitle="Activities extracted from the document" />
        <CardBody className="space-y-3">
          {showLumpSumFallbackNote && (
            <div className="flex items-start gap-2 rounded-[var(--nu-radius-md)] border border-[var(--nu-accent)]/30 bg-[var(--nu-accent-soft)] px-3.5 py-2.5 text-[12.5px] text-[var(--nu-accent)]">
              <Info size={14} strokeWidth={2.25} className="shrink-0 mt-0.5" />
              <span>
                No itemized Quantity table was found. Clicking Apply will create one <strong>LUMP SUM PROJECT</strong> row using
                the extracted Work Order Value of {formatCurrencyValue(gi.workOrderValue.value || 0, currency)}.
              </span>
            </div>
          )}

          {hasQuantityRows ? (
            <div className="overflow-x-auto nu-scrollbar rounded-[var(--nu-radius-md)] border border-[var(--nu-border)]">
              <table className="w-full min-w-[640px] table-fixed border-collapse text-[12.5px]">
                <thead className="bg-[var(--nu-surface-alt)] text-[10.5px] uppercase tracking-wide text-[var(--nu-text-muted)]">
                  <tr>
                    <th className="px-2.5 py-2 text-left font-medium">Description</th>
                    <th className="px-2.5 py-2 text-right font-medium">Qty</th>
                    <th className="px-2.5 py-2 text-center font-medium">UOM</th>
                    <th className="px-2.5 py-2 text-right font-medium">Unit Rate</th>
                    <th className="px-2.5 py-2 text-center font-medium">Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--nu-border)]">
                  {response.quantity.map((row, index) => {
                    const rowConfidence = Math.min(row.description.confidence, row.qty.confidence, row.uom.confidence, row.unitRate.confidence) as
                      | 100
                      | 90
                      | 70
                      | 40
                      | 0;
                    return (
                      <tr key={index} className="bg-[var(--nu-surface)]">
                        <td className="px-2.5 py-2 text-[var(--nu-text)]">{formatDisplayValue(row.description.value)}</td>
                        <td className="px-2.5 py-2 text-right">{row.qty.value}</td>
                        <td className="px-2.5 py-2 text-center">{row.uom.value}</td>
                        <td className="px-2.5 py-2 text-right">{formatCurrencyValue(row.unitRate.value, currency)}</td>
                        <td className="px-2.5 py-2 text-center">
                          <ConfidenceBadge confidence={rowConfidence} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : !showLumpSumFallbackNote ? (
            <p className="text-center py-6 text-[12.5px] text-[var(--nu-text-muted)]">
              No Quantity information could be extracted from this document.
            </p>
          ) : null}
        </CardBody>
      </Card>

      <Card padded={false} elevated>
        <CardHeader icon={<CreditCard size={15} />} title="Payment Milestones" subtitle="Payment schedule extracted from the document" />
        <CardBody className="space-y-2.5">
          <div className="flex items-center gap-2 text-[12.5px] text-[var(--nu-text-secondary)]">
            <span className="font-semibold text-[var(--nu-text)]">Payment Type:</span>
            {response.paymentMilestones.paymentType.value}
            <ConfidenceBadge confidence={response.paymentMilestones.paymentType.confidence} />
          </div>

          {response.paymentMilestones.milestones.length > 0 ? (
            <div className="space-y-2">
              {response.paymentMilestones.milestones.map((milestone, index) => {
                const rowConfidence = Math.min(
                  milestone.milestoneName.confidence,
                  milestone.paymentPercentage.confidence
                ) as 100 | 90 | 70 | 40 | 0;
                return (
                  <div
                    key={index}
                    className="flex flex-wrap items-center gap-3 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-3.5 py-2.5 text-[12.5px]"
                  >
                    <span className="font-semibold text-[var(--nu-text)]">{formatDisplayValue(milestone.milestoneName.value)}</span>
                    <span className="text-[var(--nu-text-secondary)]">{milestone.paymentPercentage.value}%</span>
                    {milestone.dueDate.value && <span className="text-[var(--nu-text-muted)]">Due {milestone.dueDate.value}</span>}
                    <ConfidenceBadge confidence={rowConfidence} className="ml-auto" />
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-center py-6 text-[12.5px] text-[var(--nu-text-muted)]">
              No Payment Milestones could be extracted from this document.
            </p>
          )}
        </CardBody>
      </Card>

      <div className="flex items-start gap-2 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-3.5 py-2.5 text-[11.5px] text-[var(--nu-text-muted)]">
        <FileSignature size={13} className="shrink-0 mt-0.5" />
        <span>
          Overall extraction confidence: <strong className="text-[var(--nu-text)]">{response.overallConfidence}%</strong>. Review every
          field below before clicking Apply — nothing is saved until then.
        </span>
      </div>
    </div>
  );
};

export default PdfPreview;
