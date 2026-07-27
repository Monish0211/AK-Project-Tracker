import { useMemo, useState } from "react";
import { ClipboardList, Download, Edit2, Eye, FileText, Trash2, X } from "lucide-react";

import type { InvoiceItem } from "../../../../../types/InvoiceItem";
import { Input } from "../../../../../components/ui/Input";
import { Select } from "../../../../../components/ui/Select";
import { Badge, type Tone } from "../../../../../components/ui/Badge";
import { formatBusinessINR, formatFullINR } from "../../../../../utils/formatCurrency";
import { formatIndianNumber } from "../../../../../utils/quantityCalculations";

import type { PrototypeInvoiceEntry, PrototypeInvoiceStatus, PrototypeMilestoneTerm } from "./prototypeTypes";
import type { usePrototypeInvoiceLedger } from "./usePrototypeInvoiceLedger";
import { findMilestone } from "./prototypeCalculations";
import RaiseInvoiceDrawer from "./RaiseInvoiceDrawer";

/**
 * PROTOTYPE ONLY — a self-contained stand-in for the real Billing History
 * module, scoped entirely to this prototype's own in-memory invoice history.
 * It never reads or writes project.invoiceItems / project.milestoneBillings,
 * so it can't collide with (or be mistaken for) the production
 * BillingHistoryModal. This is the "Transaction Data" screen — the expanded
 * Activity Summary only ever shows aggregates, never a per-invoice list.
 *
 * View/Edit reopen the same RaiseInvoiceDrawer in its "view"/"edit" mode, so
 * saving an edit (or deleting a row) updates the shared ledger — and this
 * modal's own `history` prop, re-derived by the parent on every render,
 * reflects it immediately with no extra plumbing.
 */
interface Props {
  items: InvoiceItem[];
  history: PrototypeInvoiceEntry[];
  ledger: ReturnType<typeof usePrototypeInvoiceLedger>;
  milestones: PrototypeMilestoneTerm[];
  initialActivityId?: string | null;
  onClose: () => void;
}

const STATUS_BADGE: Record<PrototypeInvoiceStatus, { label: string; tone: Tone }> = {
  pending: { label: "Pending", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

const formatDate = (value: string): string => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const csvEscape = (value: string): string => `"${value.replace(/"/g, '""')}"`;

const PrototypeBillingHistoryModal = ({ items, history, ledger, milestones, initialActivityId, onClose }: Props) => {
  const [activityFilter, setActivityFilter] = useState<string>(initialActivityId ?? "all");
  const [milestoneFilter, setMilestoneFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<PrototypeInvoiceStatus | "all">("all");
  const [invoiceNoSearch, setInvoiceNoSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [drawerState, setDrawerState] = useState<{ entry: PrototypeInvoiceEntry; mode: "view" | "edit" } | null>(null);

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const filteredRows = useMemo(() => {
    return history.filter((entry) => {
      if (activityFilter !== "all" && entry.activityId !== activityFilter) return false;
      if (milestoneFilter !== "all" && entry.milestoneId !== milestoneFilter) return false;
      if (statusFilter !== "all" && entry.status !== statusFilter) return false;
      if (invoiceNoSearch.trim() && !entry.invoiceNo.toLowerCase().includes(invoiceNoSearch.trim().toLowerCase())) return false;
      if (dateFrom && entry.invoiceDate < dateFrom) return false;
      if (dateTo && entry.invoiceDate > dateTo) return false;
      return true;
    });
  }, [history, activityFilter, milestoneFilter, statusFilter, invoiceNoSearch, dateFrom, dateTo]);

  const handleExport = () => {
    const header = ["Invoice No", "Date", "Activity", "Milestone", "Milestone %", "Quantity", "Amount", "Status", "Remarks"];
    const lines = filteredRows.map((row) => {
      const term = findMilestone(milestones, row.milestoneId);
      return [
        row.invoiceNo,
        row.invoiceDate,
        itemById.get(row.activityId)?.description ?? "",
        term.label,
        `${term.percent}%`,
        String(row.quantity),
        String(row.amount),
        STATUS_BADGE[row.status].label,
        row.remarks ?? "",
      ]
        .map(csvEscape)
        .join(",");
    });
    const csv = [header.map(csvEscape).join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "prototype-billing-history.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = (row: PrototypeInvoiceEntry) => {
    if (!window.confirm(`Delete invoice ${row.invoiceNo}? This is a prototype-only action and cannot be undone here.`)) {
      return;
    }
    ledger.deleteInvoice(row.id);
  };

  const drawerItem = drawerState ? itemById.get(drawerState.entry.activityId) : undefined;

  return (
    <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50 p-5">
      <div className="relative w-full max-w-6xl bg-[var(--nu-surface)] border border-[var(--nu-border)] shadow-2xl rounded-[var(--nu-radius-lg)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--nu-border)] px-6 py-5 shrink-0">
          <div>
            <h3 className="text-xl font-bold text-[var(--nu-text)]">Billing History (Prototype)</h3>
            <p className="text-xs text-[var(--nu-text-muted)] mt-1">
              Transactional view of every simulated invoice raised in this preview.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[var(--nu-text-muted)] hover:bg-[var(--nu-surface-alt)] hover:text-[var(--nu-text)] transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Filters */}
        <div className="px-6 py-4 border-b border-[var(--nu-border)] shrink-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div>
              <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">
                Activity
              </label>
              <Select value={activityFilter} onChange={(e) => setActivityFilter(e.target.value)}>
                <option value="all">All Activities</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.description}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">
                Milestone
              </label>
              <Select value={milestoneFilter} onChange={(e) => setMilestoneFilter(e.target.value)}>
                <option value="all">All Milestones</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">
                Status
              </label>
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as PrototypeInvoiceStatus | "all")}>
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="cancelled">Cancelled</option>
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">
                Invoice No
              </label>
              <Input value={invoiceNoSearch} onChange={(e) => setInvoiceNoSearch(e.target.value)} placeholder="Search INV..." />
            </div>

            <div>
              <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">
                From Date
              </label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>

            <div>
              <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">
                To Date
              </label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <p className="text-xs text-[var(--nu-text-muted)]">
              {filteredRows.length} of {history.length} invoice{history.length === 1 ? "" : "s"}
            </p>
            <button
              onClick={handleExport}
              disabled={filteredRows.length === 0}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--nu-accent)] hover:underline disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:no-underline"
            >
              <Download size={13} />
              Export CSV
            </button>
          </div>

          <div className="flex-1 overflow-auto rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] min-h-0">
            <table className="min-w-full text-[13px]">
              <thead className="sticky top-0 z-10 bg-[var(--nu-surface-alt)] border-b border-[var(--nu-border)]">
                <tr className="text-[var(--nu-text-muted)]">
                  <th className="px-4 py-3 text-left font-semibold">Invoice No</th>
                  <th className="px-4 py-3 text-left font-semibold">Date</th>
                  <th className="px-4 py-3 text-left font-semibold">Activity</th>
                  <th className="px-4 py-3 text-center font-semibold">Milestone</th>
                  <th className="px-4 py-3 text-center font-semibold">Milestone %</th>
                  <th className="px-4 py-3 text-right font-semibold">Quantity</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                  <th className="px-4 py-3 text-center font-semibold">Status</th>
                  <th className="px-4 py-3 text-center font-semibold">PDF</th>
                  <th className="px-4 py-3 text-center font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--nu-border)]">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-14 text-center">
                      <div className="flex flex-col items-center">
                        <div className="h-14 w-14 rounded-full bg-[var(--nu-accent-soft)] flex items-center justify-center">
                          <ClipboardList size={26} className="text-[var(--nu-accent)]" />
                        </div>
                        <h3 className="mt-3 text-sm font-semibold text-[var(--nu-text)]">No Invoices Match</h3>
                        <p className="mt-1 text-xs text-[var(--nu-text-muted)] max-w-sm">
                          Raise an invoice from the activity table, or adjust the filters above.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    const term = findMilestone(milestones, row.milestoneId);
                    return (
                    <tr key={row.id} className="hover:bg-[var(--nu-surface-alt)] transition-colors">
                      <td className="px-4 py-3 font-semibold text-[var(--nu-text)] whitespace-nowrap">{row.invoiceNo}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-[var(--nu-text-secondary)]">{formatDate(row.invoiceDate)}</td>
                      <td className="px-4 py-3 text-[var(--nu-text)] truncate max-w-[220px]" title={itemById.get(row.activityId)?.description}>
                        {itemById.get(row.activityId)?.description ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge tone="info" className="text-[10.5px]">
                          {term.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-[var(--nu-text-secondary)]">{term.percent}%</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatIndianNumber(row.quantity)}</td>
                      <td
                        className="px-4 py-3 text-right tabular-nums font-semibold text-[var(--nu-accent)] whitespace-nowrap"
                        title={formatFullINR(row.amount)}
                      >
                        {formatBusinessINR(row.amount)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge tone={STATUS_BADGE[row.status].tone} dot className="text-[10.5px]">
                          {STATUS_BADGE[row.status].label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {row.fileName ? (
                          <span title={row.fileName} className="inline-flex items-center justify-center text-[var(--nu-accent)]">
                            <FileText size={15} />
                          </span>
                        ) : (
                          <span className="text-[var(--nu-text-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setDrawerState({ entry: row, mode: "view" })}
                            title="View Invoice"
                            className="p-1.5 rounded-lg text-[var(--nu-accent)] hover:bg-[var(--nu-accent-soft)] transition"
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            onClick={() => setDrawerState({ entry: row, mode: "edit" })}
                            title="Edit Invoice"
                            className="p-1.5 rounded-lg text-[var(--nu-warning)] hover:bg-[var(--nu-warning-soft)] transition"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            onClick={() => handleDelete(row)}
                            title="Delete Invoice (prototype only)"
                            className="p-1.5 rounded-lg text-[var(--nu-danger)] hover:bg-[var(--nu-danger-soft)] transition"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-[var(--nu-border)] px-6 py-4 shrink-0">
          <button
            onClick={onClose}
            className="border border-[var(--nu-border)] rounded-[var(--nu-radius-md)] px-5 py-2.5 text-[var(--nu-text)] hover:bg-[var(--nu-surface-alt)] font-semibold transition"
          >
            Close
          </button>
        </div>
      </div>

      {drawerState && drawerItem && (
        <RaiseInvoiceDrawer
          item={drawerItem}
          ledger={ledger}
          milestones={milestones}
          mode={drawerState.mode}
          existingEntry={drawerState.entry}
          onClose={() => setDrawerState(null)}
        />
      )}
    </div>
  );
};

export default PrototypeBillingHistoryModal;
