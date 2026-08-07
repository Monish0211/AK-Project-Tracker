import { useMemo, useState } from "react";
import { X, Maximize2, Minimize2, ArrowLeft, Lock, CheckCircle2, Receipt, Search, FileWarning } from "lucide-react";
import type { Project } from "../../../../types/Project";
import type { InvoiceItem, InvoiceLine, InvoiceLineStatus } from "../../../../types/InvoiceItem";
import type { ProjectNote } from "../../../../types/ProjectNote";
import { Button } from "../../../../components/ui/Button";
import { Input } from "../../../../components/ui/Input";
import { Select } from "../../../../components/ui/Select";
import { Textarea } from "../../../../components/ui/Textarea";
import { Portal } from "../../../../components/ui/Portal";
import { Badge, type Tone } from "../../../../components/ui/Badge";
import { formatIndianCurrency } from "../../../../utils/formatCurrency";
import { formatIndianNumber } from "../../../../utils/quantityCalculations";
import {
  getInvoiceCyclesForProject,
  getInvoiceRaisedAmount,
  calculateInvoiceStatus,
  getGstBreakdown,
  getInvoiceCycleStatus,
  getMilestonesForProject,
  getMlmpSetRows,
  RAISE_INVOICE_STATUS_OPTIONS,
  INVOICE_LINE_STATUS_LABEL,
  round,
  type InvoiceStatus,
  type MlmpSetGroup,
} from "./InvoiceCalculations";

interface Props {
  project: Project;
  invoiceNo: string;
  onClose: () => void;
  onSave: (updatedProject: Project) => void;
}

const todayISODate = (): string => new Date().toISOString().slice(0, 10);
const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]";
const disabledFieldClass = "bg-slate-100/70 dark:bg-slate-800/50 text-[var(--nu-text-secondary)] cursor-not-allowed";
const rowKey = (itemId: string, setIndex: number, milestoneId: string) => `${itemId}:${setIndex}:${milestoneId}`;
const itemIdFromKey = (key: string): string => key.slice(0, key.indexOf(":"));

const STATUS_BADGE: Record<InvoiceStatus, Tone> = {
  Pending: "neutral",
  "Partially Invoiced": "warning",
  Completed: "success",
};

const formatNoteDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

/**
 * MLMP's own "Raise Invoice" workspace — an enterprise ERP-style split
 * (master–detail) layout, never a flat list rendering every activity's SETs
 * at once. The left panel is a lightweight, cheap-to-render list (name,
 * qty, contract value, invoice raised, balance, status — no milestone
 * computation at all); ONLY the single currently-selected activity's SETs
 * are computed via getMlmpSetRows and rendered on the right. This keeps the
 * popup fast and scalable for projects with 100+ activities — the exact
 * failure mode of the previous "render every activity's milestones
 * simultaneously" design.
 *
 * Selections persist across activities (selectedKeys is keyed by
 * itemId:setIndex:milestoneId, independent of which activity is currently
 * open), so one invoice can still span multiple activities — but
 * getMlmpSetRows is only ever computed for the activity being viewed plus
 * whichever OTHER activities already have a selection, never for the whole
 * project up front.
 */
export function MlmpInvoiceWorkspaceModal({ project, invoiceNo, onClose, onSave }: Props) {
  const [isMaximized, setIsMaximized] = useState(false);

  const items = useMemo(() => project.invoiceItems ?? [], [project.invoiceItems]);
  const hasMilestonesConfigured = useMemo(() => getMilestonesForProject(project).length > 0, [project]);

  const cycleLabel = useMemo(() => {
    const match = getInvoiceCyclesForProject(project).find((cycle) => cycle.invoiceNo === invoiceNo);
    return match?.label ?? "New Invoice";
  }, [project, invoiceNo]);

  const firstLineInThisCycle = useMemo<InvoiceLine | undefined>(() => {
    for (const item of items) {
      const line = (item.invoices ?? []).find((l) => l.invoiceNo === invoiceNo && l.status !== "Cancelled");
      if (line) return line;
    }
    return undefined;
  }, [items, invoiceNo]);

  const [invoiceDate, setInvoiceDate] = useState(firstLineInThisCycle?.invoiceDate ?? todayISODate());
  const [clientReference, setClientReference] = useState(firstLineInThisCycle?.clientReference ?? "");
  const [remarks, setRemarks] = useState(firstLineInThisCycle?.remarks ?? "");
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceLineStatus>(() => {
    const currentStatus = getInvoiceCycleStatus(project, invoiceNo);
    return (RAISE_INVOICE_STATUS_OPTIONS as InvoiceLineStatus[]).includes(currentStatus) ? currentStatus : "Raised";
  });

  // Selections across every activity — cheap to build: only ever scans each
  // item's already-saved invoice lines, never computes SET/milestone rows.
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    items.forEach((item) => {
      (item.invoices ?? []).forEach((line) => {
        if (line.invoiceNo === invoiceNo && line.status !== "Cancelled" && line.setIndex !== undefined && line.milestoneId) {
          initial.add(rowKey(item.id, line.setIndex, line.milestoneId));
        }
      });
    });
    return initial;
  });

  // ═══ LEFT PANEL — Activities list (lightweight, no milestone data) ═══
  const [search, setSearch] = useState("");

  const activitySummaries = useMemo(
    () =>
      items.map((item) => {
        const invoiceRaised = getInvoiceRaisedAmount(item);
        const balanceValue = Math.max(item.totalPrice - invoiceRaised, 0);
        return {
          item,
          invoiceRaised,
          balanceValue,
          status: calculateInvoiceStatus(item),
        };
      }),
    [items]
  );

  const filteredSummaries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activitySummaries;
    return activitySummaries.filter(
      (row) =>
        row.item.description.toLowerCase().includes(q) ||
        String(row.item.qty).includes(q) ||
        formatIndianCurrency(row.item.totalPrice).toLowerCase().includes(q)
    );
  }, [activitySummaries, search]);

  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(() => {
    for (const item of items) {
      const hasExisting = (item.invoices ?? []).some((l) => l.invoiceNo === invoiceNo && l.status !== "Cancelled");
      if (hasExisting) return item.id;
    }
    return items[0]?.id ?? null;
  });

  const selectedItem = useMemo(() => items.find((i) => i.id === selectedActivityId) ?? null, [items, selectedActivityId]);

  // ═══ RIGHT PANEL — ONLY the selected activity's SETs are ever computed ═══
  const selectedSets: MlmpSetGroup[] = useMemo(
    () => (selectedItem ? getMlmpSetRows(project, selectedItem) : []),
    [project, selectedItem]
  );

  const toggleRow = (itemId: string, set: MlmpSetGroup, milestone: MlmpSetGroup["milestones"][number]) => {
    const isLockedElsewhere = milestone.alreadyInvoiced && milestone.invoicedUnderInvoiceNo !== invoiceNo;
    if (isLockedElsewhere) return;
    const key = rowKey(itemId, set.setIndex, milestone.id);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Current activity's own selected rows — drives the "this activity" fields
  // of the summary card (Selected Sets / Milestones / Total % / Amount).
  const currentActivitySelectedRows = useMemo(() => {
    if (!selectedItem) return [];
    const rows: { set: MlmpSetGroup; milestone: MlmpSetGroup["milestones"][number] }[] = [];
    selectedSets.forEach((set) => {
      set.milestones.forEach((milestone) => {
        if (selectedKeys.has(rowKey(selectedItem.id, set.setIndex, milestone.id))) rows.push({ set, milestone });
      });
    });
    return rows;
  }, [selectedItem, selectedSets, selectedKeys]);

  const currentActivitySetLabels = useMemo(() => {
    const distinct = Array.from(new Set(currentActivitySelectedRows.map((r) => r.set.setIndex))).sort((a, b) => a - b);
    return distinct.map((setIndex) => `${selectedSets[0]?.setLabel ?? "SET"} ${setIndex}`);
  }, [currentActivitySelectedRows, selectedSets]);

  const currentActivityPercent = round(currentActivitySelectedRows.reduce((sum, r) => sum + r.milestone.percent, 0));
  const currentActivityAmount = round(currentActivitySelectedRows.reduce((sum, r) => sum + r.milestone.invoiceAmount, 0));

  // Which OTHER activities (besides the one currently open) have at least
  // one selection — getMlmpSetRows is computed for these too, but ONLY these,
  // never for every activity in the project.
  const selectedItemIds = useMemo(() => {
    const ids = new Set<string>();
    selectedKeys.forEach((key) => ids.add(itemIdFromKey(key)));
    return ids;
  }, [selectedKeys]);

  const getSetsForItem = (item: InvoiceItem): MlmpSetGroup[] =>
    item.id === selectedItem?.id ? selectedSets : getMlmpSetRows(project, item);

  // Global rows across every activity that has a selection — bounded by
  // selectedItemIds.size (in practice a handful), never the full item list.
  const globalSelectedRows = useMemo(() => {
    const rows: { item: InvoiceItem; set: MlmpSetGroup; milestone: MlmpSetGroup["milestones"][number] }[] = [];
    items.forEach((item) => {
      if (!selectedItemIds.has(item.id)) return;
      getSetsForItem(item).forEach((set) => {
        set.milestones.forEach((milestone) => {
          if (selectedKeys.has(rowKey(item.id, set.setIndex, milestone.id))) rows.push({ item, set, milestone });
        });
      });
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, selectedItemIds, selectedKeys, selectedItem, selectedSets, project]);

  const totalInvoiceAmount = round(globalSelectedRows.reduce((sum, row) => sum + row.milestone.invoiceAmount, 0));
  const gst = getGstBreakdown(project, totalInvoiceAmount);
  const activitiesTouched = selectedItemIds.size;

  const canSave = globalSelectedRows.length > 0 && invoiceDate.trim() !== "" && !!invoiceStatus;

  // Items to persist on Save: every activity with a live selection, PLUS any
  // activity that already had a saved line in this cycle (so fully
  // unchecking it this session still removes that line) — again bounded,
  // never the full project.
  const existingLineItemIds = useMemo(() => {
    const ids = new Set<string>();
    items.forEach((item) => {
      if ((item.invoices ?? []).some((l) => l.invoiceNo === invoiceNo && l.status !== "Cancelled")) ids.add(item.id);
    });
    return ids;
  }, [items, invoiceNo]);

  const handleSave = () => {
    if (!canSave) return;

    const itemsToProcess = new Set<string>([...selectedItemIds, ...existingLineItemIds]);

    const updatedItems = items.map((item) => {
      if (!itemsToProcess.has(item.id)) return item;

      const sets = getSetsForItem(item);
      let invoices = item.invoices ?? [];

      sets.forEach((set) => {
        set.milestones.forEach((milestone) => {
          const isLockedElsewhere = milestone.alreadyInvoiced && milestone.invoicedUnderInvoiceNo !== invoiceNo;
          if (isLockedElsewhere) return; // never touch another cycle's lines

          const key = rowKey(item.id, set.setIndex, milestone.id);
          const existingLine = invoices.find(
            (line) =>
              line.setIndex === set.setIndex &&
              line.milestoneId === milestone.id &&
              line.invoiceNo === invoiceNo &&
              line.status !== "Cancelled"
          );
          const isSelected = selectedKeys.has(key);

          if (isSelected) {
            const updatedLine: InvoiceLine = {
              id: existingLine?.id ?? crypto.randomUUID(),
              invoiceNo,
              invoiceDate,
              milestoneId: milestone.id,
              milestoneName: milestone.label,
              setIndex: set.setIndex,
              quantityBilled: 0,
              calculatedAmountINR: milestone.invoiceAmount,
              invoiceAmountINR: milestone.invoiceAmount,
              commercialAdjustmentINR: 0,
              clientReference: clientReference.trim() || undefined,
              remarks: remarks.trim() || undefined,
              status: invoiceStatus,
              createdBy: existingLine?.createdBy ?? "Administrator",
            };
            invoices = existingLine
              ? invoices.map((line) => (line.id === existingLine.id ? updatedLine : line))
              : [...invoices, updatedLine];
          } else if (existingLine) {
            invoices = invoices.filter((line) => line.id !== existingLine.id);
          }
        });
      });

      return { ...item, invoices };
    });

    const notes = [...(project.notes ?? [])];
    if (globalSelectedRows.length > 0) {
      const noteLines = [
        `📄 ${cycleLabel} Raised`,
        "",
        `Invoice: ${invoiceNo}`,
        `Date: ${formatNoteDate(invoiceDate)}`,
        "",
        "Milestones Invoiced",
        ...globalSelectedRows.map(
          (row) => `• ${row.item.description} — ${row.set.setLabel} ${row.set.setIndex}: ${row.milestone.label} (${row.milestone.percent}%)`
        ),
        "",
        `Total: ${globalSelectedRows.length} milestone(s) across ${activitiesTouched} activit${activitiesTouched !== 1 ? "ies" : "y"}`,
        `Invoice Amount: ${formatIndianCurrency(totalInvoiceAmount)}`,
      ];
      if (remarks.trim()) {
        noteLines.push("", "Remarks", remarks.trim());
      }
      notes.unshift({
        id: crypto.randomUUID(),
        projectId: project.id,
        message: noteLines.join("\n"),
        createdBy: "System",
        createdAt: new Date().toISOString(),
      } satisfies ProjectNote);
    }

    onSave({ ...project, invoiceItems: updatedItems, notes });
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-2 sm:p-4">
        <div
          className={`relative flex flex-col bg-[var(--nu-surface)] shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 rounded-2xl transition-all duration-150 ${
            isMaximized ? "w-[99vw] h-[98vh]" : "w-[min(96vw,1440px)] h-[min(90vh,860px)]"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-4 border-b border-[var(--nu-border)] px-6 py-3.5 shrink-0 bg-white dark:bg-slate-900">
            <div className="flex items-center gap-3.5 min-w-0">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
              >
                <ArrowLeft size={14} />
                <span>Back to Project</span>
              </button>
              <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-extrabold text-[var(--nu-text)] tracking-tight truncate">Raise Invoice</h2>
                  <span className="px-2.5 py-0.5 rounded-full bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800 text-[10.5px] font-bold uppercase tracking-wider shrink-0">
                    {cycleLabel} · MLMP Billing
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-[var(--nu-text-muted)] truncate">Select an activity, then work on its payment milestones</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsMaximized((prev) => !prev)}
                className="rounded-xl p-2 text-[var(--nu-text-muted)] transition hover:bg-[var(--nu-surface-alt)] hover:text-[var(--nu-text)] cursor-pointer"
                title={isMaximized ? "Restore workspace size" : "Maximize workspace"}
                aria-label={isMaximized ? "Restore workspace size" : "Maximize workspace"}
              >
                {isMaximized ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl p-2 text-[var(--nu-text-muted)] transition hover:bg-[var(--nu-surface-alt)] hover:text-[var(--nu-text)] cursor-pointer"
                aria-label="Close workspace"
                title="Close workspace"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Invoice Header Details */}
          <div className="shrink-0 border-b border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-4 sm:px-6 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className={labelClass}>Invoice Cycle</label>
                <Input type="text" value={cycleLabel} disabled className={disabledFieldClass} />
              </div>
              <div>
                <label className={labelClass}>Invoice No</label>
                <Input type="text" value={invoiceNo} disabled className={`${disabledFieldClass} font-mono`} />
              </div>
              <div>
                <label className={labelClass}>Invoice Date</label>
                <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Client Reference / PO Reference</label>
                <Input
                  type="text"
                  value={clientReference}
                  placeholder="Optional PO Reference"
                  onChange={(e) => setClientReference(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Invoice Status *</label>
                <Select value={invoiceStatus} onChange={(e) => setInvoiceStatus(e.target.value as InvoiceLineStatus)}>
                  {RAISE_INVOICE_STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {INVOICE_LINE_STATUS_LABEL[option]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </div>

          {/* Body — Master–Detail split */}
          {items.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="rounded-[var(--nu-radius-md)] border border-dashed border-[var(--nu-border)] p-6 text-center text-[12.5px] text-[var(--nu-text-muted)]">
                No activities configured — add activities in Quantity Details before raising an MLMP invoice.
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[40%_60%] xl:grid-cols-[35%_65%]">
              {/* LEFT — Activities (lightweight, no milestone data loaded) */}
              <div className="flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r border-[var(--nu-border)] bg-[var(--nu-surface-alt)]/40">
                <div className="shrink-0 p-3 border-b border-[var(--nu-border)]">
                  <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--nu-text-muted)]">Activities</p>
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--nu-text-muted)]" />
                    <Input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search activity, qty, or value..."
                      className="pl-8 h-9 text-[12.5px]"
                    />
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto nu-scrollbar divide-y divide-[var(--nu-border)]">
                  {filteredSummaries.length === 0 ? (
                    <p className="p-4 text-[12px] text-[var(--nu-text-muted)] italic text-center">No activities match "{search}".</p>
                  ) : (
                    filteredSummaries.map((row) => {
                      const isActive = row.item.id === selectedActivityId;
                      const hasSelectionHere = selectedItemIds.has(row.item.id);
                      return (
                        <button
                          key={row.item.id}
                          type="button"
                          onClick={() => setSelectedActivityId(row.item.id)}
                          className={`w-full text-left px-3.5 py-3 transition-colors cursor-pointer ${
                            isActive
                              ? "bg-[var(--nu-accent)] text-white"
                              : "hover:bg-[var(--nu-surface-alt)] text-[var(--nu-text)]"
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <span
                              className={`mt-1 h-3.5 w-3.5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                                isActive ? "border-white" : "border-[var(--nu-border-strong)]"
                              }`}
                            >
                              {isActive && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <p className="font-bold text-[13px] truncate">{row.item.description}</p>
                                {hasSelectionHere && (
                                  <CheckCircle2 size={12} className={isActive ? "text-white shrink-0" : "text-emerald-600 dark:text-emerald-400 shrink-0"} />
                                )}
                              </div>
                              <p className={`text-[11px] mt-0.5 ${isActive ? "text-white/80" : "text-[var(--nu-text-muted)]"}`}>
                                Qty {formatIndianNumber(row.item.qty)} {row.item.uom}
                              </p>
                              <div className={`grid grid-cols-2 gap-x-2 gap-y-0.5 mt-1.5 text-[10.5px] ${isActive ? "text-white/90" : "text-[var(--nu-text-secondary)]"}`}>
                                <span>Contract: {formatIndianCurrency(row.item.totalPrice)}</span>
                                <span>Raised: {formatIndianCurrency(row.invoiceRaised)}</span>
                                <span className="col-span-2">Balance: {formatIndianCurrency(row.balanceValue)}</span>
                              </div>
                              <div className="mt-1.5">
                                <Badge tone={isActive ? "neutral" : STATUS_BADGE[row.status]} dot className={`text-[10px] ${isActive ? "!bg-white/20 !text-white" : ""}`}>
                                  {row.status}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* RIGHT — Selected activity's Payment Milestones (lazy-loaded) */}
              <div className="flex flex-col min-h-0 overflow-y-auto nu-scrollbar p-4 sm:p-6">
                {!selectedItem ? (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-[12.5px] text-[var(--nu-text-muted)] italic">Select an activity on the left to view its payment milestones.</p>
                  </div>
                ) : !hasMilestonesConfigured ? (
                  <div className="rounded-[var(--nu-radius-md)] border border-dashed border-[var(--nu-border)] p-6 text-center text-[12.5px] text-[var(--nu-text-muted)]">
                    No Payment Milestones configured — define them in the Payments tab before raising an MLMP invoice.
                  </div>
                ) : (
                  <>
                    {/* Selected activity header stats */}
                    <div className="rounded-2xl border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] p-4">
                      <h3 className="text-[15px] font-extrabold text-[var(--nu-text)] mb-2.5">{selectedItem.description}</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)]">Quantity</p>
                          <p className="text-[13px] font-bold text-[var(--nu-text)] tabular-nums mt-0.5">
                            {formatIndianNumber(selectedItem.qty)} {selectedItem.uom}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)]">Contract Value</p>
                          <p className="text-[13px] font-bold text-[var(--nu-text)] tabular-nums mt-0.5">{formatIndianCurrency(selectedItem.totalPrice)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)]">Invoice Raised</p>
                          <p className="text-[13px] font-bold text-[var(--nu-accent)] tabular-nums mt-0.5">
                            {formatIndianCurrency(getInvoiceRaisedAmount(selectedItem))}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)]">Balance</p>
                          <p className="text-[13px] font-bold text-[var(--nu-text)] tabular-nums mt-0.5">
                            {formatIndianCurrency(Math.max(selectedItem.totalPrice - getInvoiceRaisedAmount(selectedItem), 0))}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* SET groups — only for the selected activity */}
                    {selectedSets.length === 0 || selectedSets[0].milestones.length === 0 ? (
                      <div className="mt-5 rounded-[var(--nu-radius-md)] border border-dashed border-[var(--nu-border)] p-6 text-center text-[12.5px] text-[var(--nu-text-muted)]">
                        <FileWarning size={18} className="mx-auto mb-2 text-[var(--nu-text-muted)]" />
                        No milestone SETs available for this activity.
                      </div>
                    ) : (
                      <div className="mt-5 space-y-4">
                        {selectedSets.map((set) => (
                          <div key={set.setIndex} className="rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-white dark:bg-slate-900/60 px-4 py-3">
                            <p className="text-[11.5px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)] mb-1.5">
                              {set.setLabel} {set.setIndex}
                            </p>
                            <div className="space-y-1">
                              {set.milestones.map((milestone) => {
                                const key = rowKey(selectedItem.id, set.setIndex, milestone.id);
                                const isLockedElsewhere = milestone.alreadyInvoiced && milestone.invoicedUnderInvoiceNo !== invoiceNo;
                                const isChecked = selectedKeys.has(key);

                                return (
                                  <label
                                    key={key}
                                    className={`flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors ${
                                      isLockedElsewhere
                                        ? "bg-slate-50 dark:bg-slate-800/40 cursor-not-allowed opacity-70"
                                        : "hover:bg-slate-50/70 dark:hover:bg-slate-800/30 cursor-pointer"
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      disabled={isLockedElsewhere}
                                      onChange={() => toggleRow(selectedItem.id, set, milestone)}
                                      className="h-4 w-4 rounded border-[var(--nu-border)] text-[var(--nu-accent)] focus:ring-[var(--nu-accent)] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <span className="font-semibold text-[var(--nu-text)] text-[12.5px]">{milestone.label}</span>
                                    </div>
                                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-bold border border-slate-200 dark:border-slate-700/60 shrink-0">
                                      {milestone.percent}%
                                    </span>
                                    <span className="text-right font-semibold text-[12.5px] text-[var(--nu-text)] tabular-nums w-28 shrink-0">
                                      {formatIndianCurrency(milestone.invoiceAmount)}
                                    </span>
                                    <span className="w-40 shrink-0 text-right">
                                      {isLockedElsewhere ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                          <Lock size={10} /> Invoiced ({milestone.invoicedUnderCycleLabel ?? milestone.invoicedUnderInvoiceNo})
                                        </span>
                                      ) : isChecked ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                          <CheckCircle2 size={10} /> Selected
                                        </span>
                                      ) : (
                                        <span className="text-[10px] font-semibold text-slate-400">Available</span>
                                      )}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Section divider — keeps Payment Milestones and Invoice
                        Summary visually distinct instead of merging together.
                        my-3.5 gives ~14px padding on each side of the line,
                        for a total ~29px gap between the two sections. */}
                    <div className="my-3.5 border-t border-[var(--nu-border)]" />

                    {/* Live Invoice Summary */}
                    <div className="rounded-2xl border border-blue-200/80 dark:border-slate-800 bg-gradient-to-r from-blue-50/50 via-cyan-50/20 to-blue-50/50 dark:from-slate-900/80 dark:via-slate-900/50 dark:to-slate-900/80 p-5 sm:p-6 space-y-4">
                      <div className="flex items-center gap-2">
                        <Receipt size={16} className="text-blue-600 dark:text-cyan-400" />
                        <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">Invoice Summary</h4>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-white/80 dark:bg-slate-900/80 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Activity</p>
                          <p className="text-[13px] font-extrabold text-slate-900 dark:text-white mt-0.5 truncate">{selectedItem.description}</p>
                        </div>
                        <div className="bg-white/80 dark:bg-slate-900/80 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Selected Sets</p>
                          <p className="text-[13px] font-extrabold text-slate-900 dark:text-white mt-0.5 truncate">
                            {currentActivitySetLabels.join(", ") || "—"}
                          </p>
                        </div>
                        <div className="bg-white/80 dark:bg-slate-900/80 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Milestones</p>
                          <p className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5 tabular-nums">{currentActivitySelectedRows.length}</p>
                        </div>
                        <div className="bg-white/80 dark:bg-slate-900/80 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Total %</p>
                          <p className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5 tabular-nums">{currentActivityPercent}%</p>
                        </div>
                        <div className="bg-white/80 dark:bg-slate-900/80 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Invoice Amount (This Activity)</p>
                          <p className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5 tabular-nums">{formatIndianCurrency(currentActivityAmount)}</p>
                        </div>
                        {gst.isApplicable && (
                          <div className="bg-white/80 dark:bg-slate-900/80 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">GST ({gst.ratePercent}%)</p>
                            <p className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5 tabular-nums">{formatIndianCurrency(gst.gstAmount)}</p>
                          </div>
                        )}
                        <div className="bg-white/90 dark:bg-slate-900/90 p-3 rounded-xl border border-blue-300 dark:border-cyan-800 col-span-2 sm:col-span-1">
                          <p className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 dark:text-cyan-400">Grand Total (All Activities)</p>
                          <p className="text-lg font-black text-blue-700 dark:text-cyan-300 mt-0.5 tabular-nums">{formatIndianCurrency(gst.grandTotal)}</p>
                        </div>
                      </div>

                      {activitiesTouched > 1 && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {globalSelectedRows.length} milestone(s) selected across {activitiesTouched} activities in this invoice.
                        </p>
                      )}
                    </div>

                    {/* Remarks */}
                    <div className="mt-6">
                      <label className={labelClass}>Remarks / Internal Notes</label>
                      <Textarea
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        placeholder="e.g. SET 1 & SET 2 Issue of PO stage certified together as approved by client."
                        rows={2}
                        className="resize-none"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex shrink-0 justify-between items-center gap-3 border-t border-[var(--nu-border)] px-6 py-4 bg-white dark:bg-slate-900">
            <div className="flex items-center gap-2 text-[11.5px] text-[var(--nu-text-muted)]">
              <Receipt size={14} />
              <span>{globalSelectedRows.length} SET milestone(s) selected across {activitiesTouched} activit{activitiesTouched !== 1 ? "ies" : "y"} in this invoice</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Button variant="secondary" onClick={onClose} className="px-4 py-2.5">
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={!canSave}
                className="px-6 py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save Invoice
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
