import { Fragment, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Circle, ClipboardList, FlaskConical, History, PlusCircle, Receipt } from "lucide-react";

import type { Project } from "../../../../../types/Project";
import { Card, CardBody, CardHeader } from "../../../../../components/ui/Card";
import { Badge, type Tone } from "../../../../../components/ui/Badge";
import { Button } from "../../../../../components/ui/Button";
import { EmptyState } from "../../../../../components/ui/EmptyState";
import { formatBusinessINR, formatFullINR } from "../../../../../utils/formatCurrency";
import { formatIndianNumber } from "../../../../../utils/quantityCalculations";

import { usePrototypeInvoiceLedger } from "./usePrototypeInvoiceLedger";
import {
  getProjectMilestones,
  getMilestoneSummaryRows,
  getCommercialSummary,
  type MilestoneSummaryRow,
  type CommercialSummary,
  type CommercialStatus,
} from "./prototypeCalculations";
import RaiseInvoiceDrawer from "./RaiseInvoiceDrawer";
import PrototypeBillingHistoryModal from "./PrototypeBillingHistoryModal";

/**
 * PROTOTYPE ONLY — proof-of-concept preview for review by the Project
 * Manager. Reads project.invoiceItems (existing, already-synced-from-Quantity
 * Details records) but never mutates them; all "completed qty" / invoice
 * history state lives in usePrototypeInvoiceLedger's in-memory React state
 * and resets on reload. Safe to delete this whole `prototype/` folder with
 * no effect on the real Invoice tab.
 *
 * Milestones are never hardcoded — they're read live from
 * project.paymentMilestones (the Payments tab, via getProjectMilestones()),
 * so this screen automatically shows 1, 2, 4, or any other number of
 * milestones depending on what's configured there.
 *
 * PRESENTATION IS ADAPTIVE, not one fixed layout: with 1–2 milestones the
 * expanded row shows the large visual cards (clearest for simple splits);
 * with 3+ it switches to a compact milestone table/stacked-row list so the
 * UI never grows a new card — or a new main-table column — per milestone.
 * The main activity table never carries per-milestone columns at all; it
 * only ever shows an "Overall Progress" + "Status" rollup, so its width is
 * constant regardless of how many milestones a project has.
 */
interface Props {
  project: Project;
}

const MILESTONE_BAR_TONES = [
  "bg-[var(--nu-accent)]",
  "bg-[var(--nu-success)]",
  "bg-[var(--nu-warning)]",
  "bg-[var(--nu-danger)]",
];

type MilestoneRowStatus = "completed" | "partial" | "pending";

const MILESTONE_ROW_STATUS_BADGE: Record<MilestoneRowStatus, { label: string; tone: Tone }> = {
  completed: { label: "Completed", tone: "success" },
  partial: { label: "Partial", tone: "warning" },
  pending: { label: "Pending", tone: "neutral" },
};

const getMilestoneRowStatus = (row: MilestoneSummaryRow, totalQty: number): MilestoneRowStatus => {
  if (row.completedQty <= 0) return "pending";
  if (row.completedQty >= totalQty - 0.01) return "completed";
  return "partial";
};

/** Case 1–2: large visual cards — clearest presentation for a simple split. */
const MilestoneSummaryCard = ({
  row,
  totalQty,
  barTone,
}: {
  row: MilestoneSummaryRow;
  totalQty: number;
  barTone: string;
}) => {
  const percent = totalQty > 0 ? Math.min((row.completedQty / totalQty) * 100, 100) : 0;

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-md)] p-3.5 min-w-0">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--nu-text)] break-words">{row.label}</p>
        <span className="shrink-0 rounded-full bg-[var(--nu-accent-soft)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--nu-accent)]">
          {row.percent}%
        </span>
      </div>

      <div className="mb-3">
        <div className="h-2 w-full rounded-full bg-[var(--nu-surface-alt)] overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${barTone}`} style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-1 text-[11px] font-semibold text-[var(--nu-text-muted)] text-right tabular-nums">
          {formatIndianNumber(row.completedQty)} / {formatIndianNumber(totalQty)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <div>
          <p className="text-[9.5px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">Completed Qty</p>
          <p className="text-[13px] font-semibold text-[var(--nu-text)] tabular-nums">{formatIndianNumber(row.completedQty)}</p>
        </div>
        <div>
          <p className="text-[9.5px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">Pending Qty</p>
          <p className="text-[13px] font-semibold text-[var(--nu-warning)] tabular-nums">{formatIndianNumber(row.pendingQty)}</p>
        </div>
        <div>
          <p className="text-[9.5px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">Invoice Amount</p>
          <p className="text-[13px] font-semibold text-[var(--nu-success)] tabular-nums whitespace-nowrap" title={formatFullINR(row.completedAmount)}>
            {formatBusinessINR(row.completedAmount)}
          </p>
        </div>
        <div>
          <p className="text-[9.5px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">Pending Amount</p>
          <p
            className="text-[13px] font-semibold text-[var(--nu-text-secondary)] tabular-nums whitespace-nowrap"
            title={formatFullINR(row.pendingAmount)}
          >
            {formatBusinessINR(row.pendingAmount)}
          </p>
        </div>
      </div>
    </div>
  );
};

/**
 * Case 3+: compact milestone table instead of stacking more cards
 * horizontally. Renders as a proper grid-table from `sm` up, and collapses
 * into stacked mini-rows below `sm` — so long milestone names never force
 * horizontal scrolling on a phone-width screen.
 */
const COMPACT_GRID_COLS = "minmax(140px,1.6fr) 64px 104px minmax(90px,1fr) minmax(90px,1fr) minmax(110px,1.3fr)";

const CompactMilestoneList = ({ rows, totalQty }: { rows: MilestoneSummaryRow[]; totalQty: number }) => {
  return (
    <div className="rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] overflow-hidden">
      {/* sm and up: grid-table */}
      <div className="hidden sm:block">
        <div
          className="grid gap-x-3 bg-[var(--nu-surface-alt)] px-3.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]"
          style={{ gridTemplateColumns: COMPACT_GRID_COLS }}
        >
          <span>Milestone</span>
          <span className="text-center">%</span>
          <span className="text-center">Status</span>
          <span className="text-right">Invoice Amount</span>
          <span className="text-right">Pending Amount</span>
          <span>Progress</span>
        </div>
        {rows.map((row) => {
          const status = getMilestoneRowStatus(row, totalQty);
          const badge = MILESTONE_ROW_STATUS_BADGE[status];
          const percent = totalQty > 0 ? Math.min((row.completedQty / totalQty) * 100, 100) : 0;

          return (
            <div
              key={row.id}
              className="grid gap-x-3 items-center border-t border-[var(--nu-border)] bg-[var(--nu-surface)] px-3.5 py-2.5 text-[13px]"
              style={{ gridTemplateColumns: COMPACT_GRID_COLS }}
            >
              <span className="font-semibold text-[var(--nu-text)] break-words">{row.label}</span>
              <span className="text-center text-[var(--nu-text-secondary)] tabular-nums">{row.percent}%</span>
              <span className="flex justify-center">
                <Badge tone={badge.tone} dot className="text-[10.5px]">
                  {badge.label}
                </Badge>
              </span>
              <span className="text-right font-semibold text-[var(--nu-success)] tabular-nums whitespace-nowrap" title={formatFullINR(row.completedAmount)}>
                {formatBusinessINR(row.completedAmount)}
              </span>
              <span className="text-right text-[var(--nu-text-secondary)] tabular-nums whitespace-nowrap" title={formatFullINR(row.pendingAmount)}>
                {formatBusinessINR(row.pendingAmount)}
              </span>
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-full min-w-0 rounded-full bg-[var(--nu-surface-alt)] overflow-hidden">
                  <span className="block h-full rounded-full bg-[var(--nu-accent)] transition-all duration-500" style={{ width: `${percent}%` }} />
                </span>
                <span className="shrink-0 text-[10.5px] font-semibold text-[var(--nu-text-muted)] tabular-nums whitespace-nowrap">
                  {formatIndianNumber(row.completedQty)}/{formatIndianNumber(totalQty)}
                </span>
              </span>
            </div>
          );
        })}
      </div>

      {/* below sm: stacked mini-rows */}
      <div className="sm:hidden divide-y divide-[var(--nu-border)]">
        {rows.map((row) => {
          const status = getMilestoneRowStatus(row, totalQty);
          const badge = MILESTONE_ROW_STATUS_BADGE[status];
          const percent = totalQty > 0 ? Math.min((row.completedQty / totalQty) * 100, 100) : 0;

          return (
            <div key={row.id} className="bg-[var(--nu-surface)] px-3.5 py-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[13px] font-semibold text-[var(--nu-text)] break-words">{row.label}</span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="text-[10.5px] font-bold text-[var(--nu-accent)]">{row.percent}%</span>
                  <Badge tone={badge.tone} dot className="text-[10.5px]">
                    {badge.label}
                  </Badge>
                </div>
              </div>
              <div className="h-1.5 w-full rounded-full bg-[var(--nu-surface-alt)] overflow-hidden">
                <div className="h-full rounded-full bg-[var(--nu-accent)] transition-all duration-500" style={{ width: `${percent}%` }} />
              </div>
              <div className="flex items-center justify-between text-[11.5px]">
                <span className="text-[var(--nu-text-muted)]">
                  {formatIndianNumber(row.completedQty)} / {formatIndianNumber(totalQty)}
                </span>
                <span className="font-semibold text-[var(--nu-success)] whitespace-nowrap">{formatBusinessINR(row.completedAmount)}</span>
                <span className="text-[var(--nu-text-secondary)] whitespace-nowrap">{formatBusinessINR(row.pendingAmount)} pending</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const COMMERCIAL_STATUS_BADGE: Record<CommercialStatus, { label: string; tone: Tone }> = {
  notStarted: { label: "Not Started", tone: "neutral" },
  partial: { label: "Partially Invoiced", tone: "warning" },
  fullyInvoiced: { label: "Fully Invoiced", tone: "success" },
};

/**
 * Consolidates every configured milestone into one commercial view so
 * Finance/PMO users don't have to mentally add up N milestone cards. Every
 * figure here comes from getCommercialSummary() — never recomputed locally.
 *
 * Layout: Activity Value up top, then a responsive "Milestone Invoice
 * Summary" list (one row per milestone, wraps into more rows/columns as
 * width allows — never fixed horizontal columns), then the fixed Total /
 * Balance / Status trio at the bottom. Scales cleanly from 1 to 10+
 * milestones without breaking alignment.
 */
const CommercialSummaryCard = ({ summary }: { summary: CommercialSummary }) => {
  const badge = COMMERCIAL_STATUS_BADGE[summary.status];

  return (
    <div className="mt-3.5 bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-md)] p-3.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)] mb-2.5">Commercial Summary</p>

      <div className="min-w-0">
        <p className="text-[9.5px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">Activity Value</p>
        <p className="text-[16px] font-bold text-[var(--nu-text)] tabular-nums" title={formatFullINR(summary.activityValue)}>
          {formatBusinessINR(summary.activityValue)}
        </p>
      </div>

      {summary.milestoneInvoiceAmounts.length > 0 && (
        <>
          <div className="my-3 border-t border-[var(--nu-border)]" />
          <p className="mb-2 text-[9.5px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">
            Milestone Invoice Summary
          </p>
          <div className="grid gap-x-5 gap-y-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
            {summary.milestoneInvoiceAmounts.map((m) => (
              <div key={m.id} className="flex items-start justify-between gap-3 min-w-0 py-1">
                <span className="flex items-start gap-1.5 min-w-0 text-[13px] text-[var(--nu-text-secondary)]">
                  {m.amount > 0 ? (
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-[var(--nu-success)]" />
                  ) : (
                    <Circle size={14} className="mt-0.5 shrink-0 text-[var(--nu-text-muted)]" />
                  )}
                  <span className="break-words" title={m.label}>
                    {m.label}
                  </span>
                </span>
                <span className="shrink-0 text-[13px] font-semibold text-[var(--nu-accent)] tabular-nums whitespace-nowrap" title={formatFullINR(m.amount)}>
                  {formatBusinessINR(m.amount)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="my-3 border-t border-[var(--nu-border)]" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="min-w-0">
          <p className="text-[9.5px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">Total Amount Invoiced</p>
          <p
            className="text-[14px] font-bold text-[var(--nu-text)] tabular-nums whitespace-nowrap"
            title={formatFullINR(summary.totalInvoiced)}
          >
            {formatBusinessINR(summary.totalInvoiced)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[9.5px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">Balance Amount</p>
          <p
            className="text-[14px] font-bold text-[var(--nu-warning)] tabular-nums whitespace-nowrap"
            title={formatFullINR(summary.balanceAmount)}
          >
            {formatBusinessINR(summary.balanceAmount)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[9.5px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)] mb-1">Commercial Status</p>
          <Badge tone={badge.tone} dot className="text-[11px]">
            {badge.label}
          </Badge>
        </div>
      </div>
    </div>
  );
};

const QuantityInvoiceTrackingPrototype = ({ project }: Props) => {
  const items = project.invoiceItems;
  const ledger = usePrototypeInvoiceLedger();
  const milestones = getProjectMilestones(project);
  const hasMilestones = milestones.length > 0;
  const useCompactMilestoneLayout = milestones.length >= 3;

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drawerActivityId, setDrawerActivityId] = useState<string | null>(null);
  const [billingHistoryActivityId, setBillingHistoryActivityId] = useState<string | "all" | null>(null);

  const drawerItem = items.find((item) => item.id === drawerActivityId) ?? null;

  return (
    <div className="space-y-3.5">
      <div className="flex items-start gap-2.5 rounded-[var(--nu-radius-md)] border border-[var(--nu-accent)]/25 bg-[var(--nu-accent-soft)] px-4 py-3">
        <FlaskConical size={16} className="mt-0.5 shrink-0 text-[var(--nu-accent)]" />
        <div>
          <p className="text-[13px] font-semibold text-[var(--nu-accent)]">Prototype Preview — Quantity-Based Invoice Tracking</p>
          <p className="text-[12px] text-[var(--nu-text-muted)] mt-0.5">
            Payment milestones are read live from the Payments tab and applied per completed quantity. Everything on this screen is simulated for review and is not saved.
          </p>
        </div>
      </div>

      <Card padded={false}>
        <CardHeader
          icon={<Receipt size={16} />}
          title="Quantity-Based Invoice Tracking"
          subtitle="Progress tracked per completed quantity, against the milestones configured in Payments"
          action={
            <Button
              variant="secondary"
              size="sm"
              icon={<History size={14} />}
              onClick={() => setBillingHistoryActivityId("all")}
            >
              Billing History
            </Button>
          }
        />

        {items.length === 0 ? (
          <CardBody>
            <EmptyState
              icon={<ClipboardList size={22} />}
              title="No Work Packages Added"
              description="Add activities in Quantity Details to preview quantity-based tracking."
            />
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="nu-table-th px-3 py-2.5 text-left">Activity</th>
                  <th className="nu-table-th px-3 py-2.5 text-right">Qty</th>
                  <th className="nu-table-th px-3 py-2.5 text-center">UOM</th>
                  <th className="nu-table-th px-3 py-2.5 text-right">Unit Rate</th>
                  <th className="nu-table-th px-3 py-2.5 text-right">Total Value</th>
                  <th className="nu-table-th px-3 py-2.5 text-left">Overall Progress</th>
                  <th className="nu-table-th px-3 py-2.5 text-center">Status</th>
                  <th className="nu-table-th px-3 py-2.5 text-center w-16">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const entry = ledger.getLedger(item.id);
                  const isExpanded = expandedId === item.id;
                  const summaryRows = getMilestoneSummaryRows(entry, item.qty, item.unitPrice, milestones);
                  const commercialSummary = getCommercialSummary(entry, item.unitPrice, item.totalPrice, milestones);
                  const completedMilestoneCount = summaryRows.filter((row) => getMilestoneRowStatus(row, item.qty) === "completed").length;
                  const overallPercent = commercialSummary.activityValue > 0
                    ? Math.min((commercialSummary.totalInvoiced / commercialSummary.activityValue) * 100, 100)
                    : 0;
                  const statusBadge = COMMERCIAL_STATUS_BADGE[commercialSummary.status];

                  return (
                    <Fragment key={item.id}>
                      <tr className="nu-table-row">
                        <td className="px-3 py-3 font-semibold text-[var(--nu-text)] max-w-[240px] break-words">{item.description}</td>
                        <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{formatIndianNumber(item.qty)}</td>
                        <td className="px-3 py-3 text-center text-[var(--nu-text-secondary)] whitespace-nowrap">{item.uom}</td>
                        <td
                          className="px-3 py-3 text-right tabular-nums whitespace-nowrap"
                          title={formatFullINR(item.unitPrice)}
                        >
                          {formatBusinessINR(item.unitPrice)}
                        </td>
                        <td
                          className="px-3 py-3 text-right tabular-nums font-semibold whitespace-nowrap"
                          title={formatFullINR(item.totalPrice)}
                        >
                          {formatBusinessINR(item.totalPrice)}
                        </td>
                        <td className="px-3 py-3 min-w-[140px]">
                          {hasMilestones ? (
                            <div className="space-y-1">
                              <p className="text-[11.5px] font-semibold text-[var(--nu-text)] whitespace-nowrap">
                                {completedMilestoneCount} of {milestones.length} Milestone{milestones.length === 1 ? "" : "s"}
                              </p>
                              <div className="h-1.5 w-full min-w-[80px] rounded-full bg-[var(--nu-surface-alt)] overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-[var(--nu-accent)] transition-all duration-500"
                                  style={{ width: `${overallPercent}%` }}
                                />
                              </div>
                            </div>
                          ) : (
                            <span className="text-[var(--nu-text-muted)]">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center whitespace-nowrap">
                          <Badge tone={statusBadge.tone} dot className="text-[10.5px]">
                            {statusBadge.label}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : item.id)}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-[var(--nu-radius-sm)] text-[var(--nu-text-muted)] hover:bg-[var(--nu-surface-alt)] hover:text-[var(--nu-text)] transition-colors cursor-pointer"
                            aria-label={isExpanded ? "Collapse activity details" : "Expand activity details"}
                          >
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td colSpan={8} className="bg-[var(--nu-surface-alt)] px-4 py-4 border-b border-[var(--nu-border)]">
                            {!hasMilestones ? (
                              <EmptyState
                                icon={<ClipboardList size={22} />}
                                title="No Payment Milestones Configured"
                                description="Define payment milestones for this project in the Payments tab to enable invoicing for this activity."
                              />
                            ) : useCompactMilestoneLayout ? (
                              <>
                                {/* 3+ milestones: compact table/stacked list — never a new card per milestone. */}
                                <CompactMilestoneList rows={summaryRows} totalQty={item.qty} />
                                <CommercialSummaryCard summary={commercialSummary} />
                              </>
                            ) : (
                              <>
                                {/* 1–2 milestones: large visual cards, clearest for a simple split. A
                                    single milestone stretches to the full row instead of leaving unused
                                    whitespace beside a half-width card. */}
                                <div className={`grid gap-3.5 ${summaryRows.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
                                  {summaryRows.map((row, index) => (
                                    <MilestoneSummaryCard
                                      key={row.id}
                                      row={row}
                                      totalQty={item.qty}
                                      barTone={MILESTONE_BAR_TONES[index % MILESTONE_BAR_TONES.length]}
                                    />
                                  ))}
                                </div>
                                <CommercialSummaryCard summary={commercialSummary} />
                              </>
                            )}

                            {/* Actions */}
                            <div className="flex flex-wrap items-center gap-2.5 mt-3.5">
                              {!hasMilestones ? (
                                <Button variant="primary" size="sm" disabled className="disabled:cursor-not-allowed disabled:opacity-50">
                                  No Milestones — Configure Payments First
                                </Button>
                              ) : commercialSummary.status === "fullyInvoiced" ? (
                                <Button variant="primary" size="sm" disabled className="disabled:cursor-not-allowed disabled:opacity-50">
                                  Fully Invoiced – No Remaining Quantity
                                </Button>
                              ) : (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  icon={<PlusCircle size={14} />}
                                  onClick={() => setDrawerActivityId(item.id)}
                                >
                                  Raise Invoice
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                icon={<History size={14} />}
                                onClick={() => setBillingHistoryActivityId(item.id)}
                              >
                                View Billing History
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {drawerItem && (
        <RaiseInvoiceDrawer
          item={drawerItem}
          ledger={ledger}
          milestones={milestones}
          onClose={() => setDrawerActivityId(null)}
        />
      )}

      {billingHistoryActivityId && (
        <PrototypeBillingHistoryModal
          items={items}
          history={ledger.getAllHistory()}
          ledger={ledger}
          milestones={milestones}
          initialActivityId={billingHistoryActivityId === "all" ? undefined : billingHistoryActivityId}
          onClose={() => setBillingHistoryActivityId(null)}
        />
      )}
    </div>
  );
};

export default QuantityInvoiceTrackingPrototype;
