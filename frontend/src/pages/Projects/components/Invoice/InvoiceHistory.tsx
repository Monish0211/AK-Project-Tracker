import { useMemo, useState } from "react";
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

interface Props {
  project: Project;
  onView: (item: InvoiceItem, line: InvoiceLine) => void;
  /** Omit to hide the Edit action entirely — e.g. in a read-only context. */
  onEdit?: (item: InvoiceItem, line: InvoiceLine) => void;
  /** Omit to hide the Delete action entirely — e.g. in a read-only context. */
  onDelete?: (item: InvoiceItem, line: InvoiceLine) => void;
  /** Pre-selects the Activity filter — e.g. when opened via an activity's own "View History" action. */
  initialActivityFilter?: string | null;
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
  status: InvoiceLineStatus;
  createdBy: string;
  item: InvoiceItem;
  line: InvoiceLine;
}

const STATUS_BADGE: Record<InvoiceLineStatus, Tone> = {
  Pending: "warning",
  Paid: "success",
  Cancelled: "danger",
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
export function InvoiceHistory({ project, onView, onEdit, onDelete, initialActivityFilter }: Props) {
  const [activityFilter, setActivityFilter] = useState(initialActivityFilter ?? "all");
  const [statusFilter, setStatusFilter] = useState<InvoiceLineStatus | "all">("all");
  const [search, setSearch] = useState("");

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
          status: line.status,
          createdBy: line.createdBy,
          item,
          line,
        });
      });
    });
    return all.sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate) || b.invoiceNo.localeCompare(a.invoiceNo));
  }, [items]);

  const filteredRows = rows.filter((row) => {
    if (activityFilter !== "all" && row.item.id !== activityFilter) return false;
    if (statusFilter !== "all" && row.status !== statusFilter) return false;
    if (search.trim() && !row.invoiceNo.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-3.5">
      <Card padded={false}>
        <CardHeader icon={<History size={16} />} title="Invoice History" subtitle="Every invoice line raised across all activities" />

        <div className="px-3.5 py-3 border-b border-[var(--nu-border)] grid grid-cols-1 sm:grid-cols-3 gap-3">
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
            <option value="Pending">Pending</option>
            <option value="Paid">Paid</option>
            <option value="Cancelled">Cancelled</option>
          </Select>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search Invoice No..." />
        </div>

        {filteredRows.length === 0 ? (
          <CardBody>
            <EmptyState
              icon={<Receipt size={22} />}
              title="No Invoices Raised"
              description="Raise an invoice from the Activities Billing table above, or adjust the filters."
            />
          </CardBody>
        ) : (
          <div className="max-h-[26rem] overflow-auto nu-scrollbar">
            <table className="w-full min-w-[1180px] border-collapse text-[12.5px]">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="nu-table-th px-3 py-2.5 text-left">Invoice No</th>
                  <th className="nu-table-th px-3 py-2.5 text-left">Invoice Date</th>
                  <th className="nu-table-th px-3 py-2.5 text-left">Activity</th>
                  <th className="nu-table-th px-3 py-2.5 text-left">Milestone</th>
                  <th className="nu-table-th px-3 py-2.5 text-right">Qty Invoiced</th>
                  <th className="nu-table-th px-3 py-2.5 text-right">Unit Rate</th>
                  <th className="nu-table-th px-3 py-2.5 text-right">System Amount</th>
                  <th className="nu-table-th px-3 py-2.5 text-right">Invoice Amount</th>
                  <th className="nu-table-th px-3 py-2.5 text-right">Commercial Adjustment</th>
                  <th className="nu-table-th px-3 py-2.5 text-center">Invoice Status</th>
                  <th className="nu-table-th px-3 py-2.5 text-left">Created By</th>
                  <th className="nu-table-th px-3 py-2.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.key} className="nu-table-row">
                    <td className="px-3 py-2.5 font-semibold text-[var(--nu-text)] whitespace-nowrap">{row.invoiceNo}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-[var(--nu-text-secondary)]">{formatDate(row.invoiceDate)}</td>
                    <td className="px-3 py-2.5 max-w-[180px] truncate" title={row.activity}>{row.activity}</td>
                    <td className="px-3 py-2.5 max-w-[180px] truncate font-medium text-[var(--nu-text)]" title={row.description}>{row.description}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                      {formatIndianNumber(row.qty)} {row.uom}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap text-[var(--nu-text-secondary)]">
                      <MoneyValue value={row.unitPrice} />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                      <MoneyValue value={row.systemAmount} />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                      <MoneyValue value={row.amount} className="font-semibold text-[var(--nu-accent)]" />
                    </td>
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
                    <td className="px-3 py-2.5 text-center">
                      <Badge tone={STATUS_BADGE[row.status]} dot className="text-[10.5px]">
                        {row.status}
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
                          onClick={() => window.print()}
                          title="Print"
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
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
