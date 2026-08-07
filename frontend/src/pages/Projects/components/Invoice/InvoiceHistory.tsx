import { Fragment, useEffect, useMemo, useState } from "react";
import { Edit2, Eye, History, Printer, Receipt, Trash2 } from "lucide-react";
import type { Project } from "../../../../types/Project";
import type { InvoiceItem, InvoiceLine, InvoiceLineStatus } from "../../../../types/InvoiceItem";
import { Card, CardBody, CardHeader } from "../../../../components/ui/Card";
import { Badge, type Tone } from "../../../../components/ui/Badge";
import { Input } from "../../../../components/ui/Input";
import { Select } from "../../../../components/ui/Select";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { formatBusinessINR } from "../../../../utils/formatCurrency";
import { formatIndianNumber } from "../../../../utils/quantityCalculations";
import { MoneyValue, MoneyTooltip } from "../../../../components/ui/MoneyTooltip";
import {
  getInvoiceCyclesForProject,
  getInvoiceCycleStatus,
  getInvoiceMethod,
  getMilestonesForProject,
  getMlmpSetLabel,
  INVOICE_LINE_STATUS_LABEL,
  INVOICE_LINE_STATUS_TONE,
  round,
} from "./InvoiceCalculations";
import { formatIndianCurrency } from "../../../../utils/formatCurrency";

interface Props {
  project: Project;
  onView: (item: InvoiceItem, line: InvoiceLine) => void;
  /** Omit to hide the Edit action entirely — e.g. in a read-only context. */
  onEdit?: (item: InvoiceItem, line: InvoiceLine) => void;
  /** Omit to hide the Delete action entirely — e.g. in a read-only context. */
  onDelete?: (item: InvoiceItem, line: InvoiceLine) => void;
  /** Update status for an entire invoice cycle / group. */
  onUpdateInvoiceStatus?: (invoiceNo: string, newStatus: InvoiceLineStatus) => void;
  /** Opens the Print Invoice Document modal for this line's invoice cycle — the same isolated-iframe print pipeline used everywhere else, never a raw window.print(). */
  onPrintInvoice?: (invoiceNo: string) => void;
  /** Pre-selects the Activity filter — e.g. when opened via an activity's own "View History" action. */
  initialActivityFilter?: string | null;
  /** Scrolls to and highlights this invoice line's row on mount — e.g. when opened via a notification's deep link to a specific invoice. */
  highlightLineId?: string | null;
}

interface HistoryRow {
  key: string;
  invoiceNo: string;
  invoiceDate: string;
  activity: string;
  description: string;
  qty: number;
  uom: string;
  unitPrice: number;
  systemAmount: number;
  amount: number;
  /** Lump Sum/MLMP only — the milestone's configured %, looked up from the project's Payment Milestones by line.milestoneId. Shared source for both methods. */
  milestonePercent?: number;
  /** MLMP only — "SET 1", "PACKAGE 3", etc, from line.setIndex + the activity's own UOM label. */
  setLabel?: string;
  status: InvoiceLineStatus;
  createdBy: string;
  item: InvoiceItem;
  line: InvoiceLine;
}

const STATUS_BADGE: Record<InvoiceLineStatus, Tone> = INVOICE_LINE_STATUS_TONE;

const STATUS_DROPDOWN_STYLES: Record<InvoiceLineStatus, string> = {
  Draft: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700",
  Raised: "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800",
  PartiallyPaid: "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800",
  Paid: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
  Cancelled: "bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800",
};

const formatDate = (value: string): string => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

/**
 * Section 4 — every invoice line across every activity, unified into one
 * table (no per-activity duplicate history views). Section 5 sits below it
 * as a future-ready placeholder only — see types/QuantityRevision.ts.
 */
export function InvoiceHistory({ project, onView, onEdit, onDelete, onUpdateInvoiceStatus, onPrintInvoice, initialActivityFilter, highlightLineId }: Props) {
  const [activityFilter, setActivityFilter] = useState(initialActivityFilter ?? "all");
  const [statusFilter, setStatusFilter] = useState<InvoiceLineStatus | "all">("all");
  const [search, setSearch] = useState("");

  // Lump Sum and MLMP both bill against milestone percentages, not activity
  // quantities — the Qty Invoiced/Unit Rate/System Amount/Commercial
  // Adjustment columns are always 0/meaningless for those lines, so this
  // table shows a milestone-based column set instead whenever the whole
  // project is Lump Sum or MLMP. Invoice Method is a project-wide setting,
  // never mixed per-cycle, so there's no case where multiple column sets are
  // needed at once. Both methods read milestone % from the SAME project-wide
  // Payment Milestones list (getMilestonesForProject) — MLMP additionally
  // gets its own SET column, since the same milestone recurs once per SET.
  const isLumpSum = getInvoiceMethod(project) === "lump_sum";
  const isMlmp = getInvoiceMethod(project) === "mlmp";
  const isMilestoneBased = isLumpSum || isMlmp;
  // Amount Based bills a direct amount against Contract Value — no
  // milestone, no quantity, no rate at all, so it drops the Milestone
  // column entirely (not just the % sub-column) as well as the Qty/Rate/
  // System Amount and Commercial Adjustment columns.
  const isAmountBased = getInvoiceMethod(project) === "amount_based";
  const milestones = useMemo(() => getMilestonesForProject(project), [project]);

  // Deep-linked from a notification — scroll the highlighted invoice line
  // into view once its row exists in the DOM.
  useEffect(() => {
    if (!highlightLineId) return;
    const row = document.getElementById(`invoice-history-row-${highlightLineId}`);
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightLineId]);

  const items = useMemo(() => project.invoiceItems ?? [], [project.invoiceItems]);

  const rows: HistoryRow[] = useMemo(() => {
    const all: HistoryRow[] = [];
    items.forEach((item) => {
      (item.invoices ?? []).forEach((line) => {
        all.push({
          key: line.id,
          invoiceNo: line.invoiceNo,
          invoiceDate: line.invoiceDate,
          activity: item.description,
          description: line.milestoneName || line.description || "—",
          qty: line.quantityBilled,
          uom: item.uom,
          // Frozen at billing time (line.unitPriceINR) — never the activity's
          // current live rate, so a later Unit Rate revision never rewrites
          // what a historical invoice actually billed at. Falls back to the
          // live rate only for legacy records saved before this field existed.
          unitPrice: line.unitPriceINR ?? item.unitPrice,
          systemAmount: line.calculatedAmountINR ?? 0,
          amount: line.invoiceAmountINR,
          // Shared source for both methods — Lump Sum and MLMP both read
          // the project's existing Payment Milestones, never a separate
          // per-activity template.
          milestonePercent: milestones.find((m) => m.id === line.milestoneId)?.percent,
          setLabel: isMlmp && line.setIndex !== undefined ? `${getMlmpSetLabel(item)} ${line.setIndex}` : undefined,
          status: line.status,
          createdBy: line.createdBy,
          item,
          line,
        });
      });
    });
    return all.sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate) || b.invoiceNo.localeCompare(a.invoiceNo));
  }, [items, milestones, isMlmp]);

  const filteredRows = rows.filter((row) => {
    if (activityFilter !== "all" && row.item.id !== activityFilter) return false;
    if (statusFilter !== "all" && row.status !== statusFilter) return false;
    if (search.trim() && !row.invoiceNo.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  // Invoice Cycles are project-level — every activity billed under, say,
  // "Invoice 1" shares that same invoiceNo. Group History by it (reusing the
  // exact same labeling Invoice Summary uses) so the table reads as "Invoice
  // 1 [Draftsman, Lead Engineer, ...]" instead of a flat list where the same
  // cycle's rows are scattered and unlabeled.
  const cycleLabels = useMemo(() => {
    const map = new Map<string, string>();
    getInvoiceCyclesForProject(project).forEach((cycle) => {
      if (!cycle.isNew) map.set(cycle.invoiceNo, cycle.label);
    });
    return map;
  }, [project]);

  const groupedRows = useMemo(() => {
    const order: string[] = [];
    const byInvoiceNo = new Map<string, HistoryRow[]>();
    filteredRows.forEach((row) => {
      if (!byInvoiceNo.has(row.invoiceNo)) {
        byInvoiceNo.set(row.invoiceNo, []);
        order.push(row.invoiceNo);
      }
      byInvoiceNo.get(row.invoiceNo)!.push(row);
    });
    return order.map((invoiceNo) => {
      const groupRows = byInvoiceNo.get(invoiceNo)!;

      // Lump Sum: the same milestone repeats once per activity (proportional
      // distribution), so dedupe by milestoneId before summarizing — "BEDP +
      // AFC, 50%", never "BEDP + BEDP + BEDP + AFC + AFC + AFC, 300%".
      const distinctMilestoneIds = Array.from(new Set(groupRows.map((row) => row.line.milestoneId).filter(Boolean)));
      const distinctMilestones = distinctMilestoneIds
        .map((id) => milestones.find((m) => m.id === id))
        .filter((m): m is NonNullable<typeof m> => !!m);

      return {
        invoiceNo,
        label: cycleLabels.get(invoiceNo) ?? "Invoice",
        rows: groupRows,
        activityCount: new Set(groupRows.map((row) => row.item.id)).size,
        milestoneNames: distinctMilestones.map((m) => m.label),
        milestoneTotalPercent: round(distinctMilestones.reduce((sum, m) => sum + m.percent, 0)),
        milestoneTotalAmount: round(
          groupRows.filter((row) => row.status !== "Cancelled").reduce((sum, row) => sum + row.amount, 0)
        ),
        // The cycle's own aggregate status — same figure the Invoice Summary
        // card and the Raise Invoice Cycle picker show, never independently
        // re-derived here.
        status: getInvoiceCycleStatus(project, invoiceNo),
      };
    });
  }, [filteredRows, cycleLabels, project, milestones]);

  return (
    <div className="h-full">
      <Card padded={false} className="h-full flex flex-col">
        <CardHeader icon={<History size={16} />} title="Invoice History" subtitle="Every invoice line raised across all activities" />

        <div className="px-3.5 py-3 border-b border-[var(--nu-border)] grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
          <Select value={activityFilter} onChange={(e) => setActivityFilter(e.target.value)}>
            <option value="all">All Activities</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.description}
              </option>
            ))}
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as InvoiceLineStatus | "all")}>
            <option value="all">All Status</option>
            {(Object.keys(INVOICE_LINE_STATUS_LABEL) as InvoiceLineStatus[]).map((option) => (
              <option key={option} value={option}>
                {INVOICE_LINE_STATUS_LABEL[option]}
              </option>
            ))}
          </Select>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search Invoice No..." />
        </div>

        {filteredRows.length === 0 ? (
          <CardBody className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={<Receipt size={22} />}
              title="No Invoices Raised"
              description="Raise an invoice from the Activities Billing table above, or adjust the filters."
            />
          </CardBody>
        ) : (
          <div className="flex-1 max-h-[380px] lg:max-h-[420px] overflow-auto nu-scrollbar">
            <table className="w-full min-w-[1180px] border-collapse text-[12.5px]">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="nu-table-th px-3 py-2.5 text-left">Invoice No</th>
                  <th className="nu-table-th px-3 py-2.5 text-left">Invoice Date</th>
                  <th className="nu-table-th px-3 py-2.5 text-left">Activity</th>
                  {isMlmp && <th className="nu-table-th px-3 py-2.5 text-left">SET</th>}
                  {!isAmountBased && <th className="nu-table-th px-3 py-2.5 text-left">Milestone</th>}
                  {!isAmountBased && (
                    isMilestoneBased ? (
                      <th className="nu-table-th px-3 py-2.5 text-right">Milestone %</th>
                    ) : (
                      <>
                        <th className="nu-table-th px-3 py-2.5 text-right">Qty Invoiced</th>
                        <th className="nu-table-th px-3 py-2.5 text-right">Unit Rate</th>
                        <th className="nu-table-th px-3 py-2.5 text-right">System Amount</th>
                      </>
                    )
                  )}
                  <th className="nu-table-th px-3 py-2.5 text-right">Invoice Amount</th>
                  {!isMilestoneBased && !isAmountBased && <th className="nu-table-th px-3 py-2.5 text-right">Commercial Adjustment</th>}
                  <th className="nu-table-th px-3 py-2.5 text-center">Invoice Status</th>
                  <th className="nu-table-th px-3 py-2.5 text-left">Created By</th>
                  <th className="nu-table-th px-3 py-2.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {groupedRows.map((group) => {
                  const columnCount = isLumpSum ? 10 : isMlmp ? 11 : isAmountBased ? 7 : 12;
                  return (
                  <Fragment key={group.invoiceNo}>
                    <tr>
                      <td colSpan={columnCount} className="px-3 py-2 bg-[var(--nu-surface-alt)] border-y border-[var(--nu-border)] font-bold text-[12px] text-[var(--nu-text)]">
                        <div className="flex items-center gap-2.5">
                          <span>
                            {group.label} <span className="font-mono font-semibold text-[var(--nu-text-secondary)]">({group.invoiceNo})</span>{" "}
                            <span className="font-medium text-[var(--nu-text-muted)]">
                              {isLumpSum
                                ? `— ${group.milestoneNames.join(", ") || "no milestones"} · Total ${group.milestoneTotalPercent}% · ${formatIndianCurrency(group.milestoneTotalAmount)}`
                                : isMlmp
                                ? `— ${group.activityCount} ${group.activityCount === 1 ? "activity" : "activities"} · ${group.rows.length} SET milestone(s) · ${formatIndianCurrency(group.milestoneTotalAmount)}`
                                : isAmountBased
                                ? `— ${group.activityCount} ${group.activityCount === 1 ? "activity" : "activities"} · ${formatIndianCurrency(group.milestoneTotalAmount)}`
                                : `— ${group.activityCount} ${group.activityCount === 1 ? "activity" : "activities"}`}
                            </span>
                          </span>
                          {onUpdateInvoiceStatus ? (
                            <div className="relative inline-flex items-center">
                              <select
                                value={group.status}
                                onChange={(e) => onUpdateInvoiceStatus(group.invoiceNo, e.target.value as InvoiceLineStatus)}
                                className={`appearance-none pl-6 pr-6 py-1 rounded-md text-[11px] font-bold border transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[var(--nu-accent)] ${STATUS_DROPDOWN_STYLES[group.status]}`}
                                title={`Change master status for ${group.label} (${group.invoiceNo})`}
                              >
                                {(Object.keys(INVOICE_LINE_STATUS_LABEL) as InvoiceLineStatus[]).map((st) => (
                                  <option key={st} value={st} className="bg-white dark:bg-slate-900 text-[var(--nu-text)] font-medium">
                                    {INVOICE_LINE_STATUS_LABEL[st]}
                                  </option>
                                ))}
                              </select>
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-current pointer-events-none" />
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] pointer-events-none opacity-70">
                                ▼
                              </span>
                            </div>
                          ) : (
                            <Badge tone={STATUS_BADGE[group.status]} dot className="text-[10px]">
                              {INVOICE_LINE_STATUS_LABEL[group.status]}
                            </Badge>
                          )}
                        </div>
                      </td>
                    </tr>
                    {group.rows.map((row) => (
                  <tr
                    key={row.key}
                    id={`invoice-history-row-${row.key}`}
                    className={`nu-table-row ${
                      row.key === highlightLineId
                        ? "bg-[var(--nu-accent-soft)] ring-2 -ring-inset ring-[var(--nu-accent)]"
                        : ""
                    }`}
                  >
                    <td className="px-3 py-2.5 font-semibold text-[var(--nu-text)] whitespace-nowrap">{row.invoiceNo}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-[var(--nu-text-secondary)]">{formatDate(row.invoiceDate)}</td>
                    <td className="px-3 py-2.5 max-w-[180px] truncate" title={row.activity}>{row.activity}</td>
                    {isMlmp && (
                      <td className="px-3 py-2.5 whitespace-nowrap text-[var(--nu-text-secondary)] font-semibold">{row.setLabel ?? "—"}</td>
                    )}
                    {!isAmountBased && (
                      <td className="px-3 py-2.5 max-w-[180px] truncate font-medium text-[var(--nu-text)]" title={row.description}>{row.description}</td>
                    )}
                    {!isAmountBased && (
                      isMilestoneBased ? (
                        <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                          {row.milestonePercent !== undefined ? `${row.milestonePercent}%` : "—"}
                        </td>
                      ) : (
                        <>
                          <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                            {formatIndianNumber(row.qty)} {row.uom}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap text-[var(--nu-text-secondary)]">
                            <MoneyValue value={row.unitPrice} />
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                            <MoneyValue value={row.systemAmount} />
                          </td>
                        </>
                      )
                    )}
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                      <MoneyValue value={row.amount} className="font-semibold text-[var(--nu-accent)]" />
                    </td>
                    {!isMilestoneBased && !isAmountBased && (
                      <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap text-xs font-mono">
                        {row.line.commercialAdjustmentINR && Math.abs(row.line.commercialAdjustmentINR) > 0.01 ? (
                          <MoneyTooltip
                            value={row.line.commercialAdjustmentINR}
                            className={`font-semibold ${row.line.commercialAdjustmentINR < 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}
                          >
                            {row.line.commercialAdjustmentINR < 0 ? "-" : "+"}{formatBusinessINR(Math.abs(row.line.commercialAdjustmentINR))}
                          </MoneyTooltip>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-center">
                      <Badge tone={STATUS_BADGE[row.status]} dot className="text-[10.5px] whitespace-nowrap">
                        {INVOICE_LINE_STATUS_LABEL[row.status]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-[var(--nu-text-secondary)]">{row.createdBy}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => onView(row.item, row.line)}
                          title="View Invoice"
                          className="p-1.5 rounded-lg text-[var(--nu-accent)] hover:bg-[var(--nu-accent-soft)] transition"
                        >
                          <Eye size={15} />
                        </button>
                        {onEdit && (
                          <button
                            type="button"
                            onClick={() => onEdit(row.item, row.line)}
                            title="Edit Invoice"
                            className="p-1.5 rounded-lg text-[var(--nu-warning)] hover:bg-[var(--nu-warning-soft)] transition"
                          >
                            <Edit2 size={15} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onPrintInvoice?.(row.invoiceNo)}
                          title="Print Invoice"
                          className="p-1.5 rounded-lg text-[var(--nu-text-muted)] hover:bg-[var(--nu-surface-alt)] hover:text-[var(--nu-text)] transition"
                        >
                          <Printer size={15} />
                        </button>
                        {onDelete && (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Delete invoice ${row.invoiceNo}? This cannot be undone.`)) {
                                onDelete(row.item, row.line);
                              }
                            }}
                            title="Delete Invoice"
                            className="p-1.5 rounded-lg text-[var(--nu-danger)] hover:bg-[var(--nu-danger-soft)] transition"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                    ))}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
