import { useEffect, useMemo, useState } from "react";
import { FileText, PlusCircle, X } from "lucide-react";

import type { Project } from "../../../../types/Project";
import type { InvoiceItem, InvoiceLine, InvoiceLineStatus } from "../../../../types/InvoiceItem";
import { Button } from "../../../../components/ui/Button";
import { Input } from "../../../../components/ui/Input";
import { Select } from "../../../../components/ui/Select";
import { Textarea } from "../../../../components/ui/Textarea";

import {
  getMilestonesForProject,
  calculateLineAmount,
  getEditableMaxQuantity,
  getLinePreview,
  suggestNextInvoiceNumber,
} from "./InvoiceCalculations";
import { InvoiceLineTable, type InvoiceLineRow } from "./InvoiceLineTable";

interface Props {
  project: Project;
  item: InvoiceItem;
  mode?: "create" | "view" | "edit";
  existingLine?: InvoiceLine;
  onClose: () => void;
  onSave: (updatedProject: Project) => void;
}

interface DraftLine {
  key: string;
  milestoneId?: string;
  milestoneLabel?: string;
  description: string;
  quantityInput: string;
  custom: boolean;
}

const todayISODate = (): string => new Date().toISOString().slice(0, 10);
const bucketKey = (milestoneId?: string): string => milestoneId ?? "__none__";
const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]";
const disabledFieldClass = "disabled:opacity-60 disabled:cursor-not-allowed";

/**
 * Right-side drawer — the single place invoices get raised, viewed, or
 * edited. Width scales with the viewport (full-screen on mobile, ~90% on
 * tablets, 620–760px from laptop up to a 1920px desktop) while height is
 * always capped to the viewport, with only the content area scrolling and
 * the Cancel/Save footer staying fixed at the bottom.
 *
 * In "create" mode it renders one dynamic billable line per configured
 * payment milestone (or a single free-text line when the project has none),
 * so PMO's per-milestone tracking and Accounts' direct-quantity billing are
 * the same table, never two separate flows. "view"/"edit" operate on
 * exactly one already-raised InvoiceLine.
 */
export function RaiseInvoiceDrawer({ project, item, mode = "create", existingLine, onClose, onSave }: Props) {
  const [show, setShow] = useState(false);

  const isViewMode = mode === "view";
  const isEditMode = mode === "edit";
  const isCreateMode = mode === "create";

  const milestones = useMemo(() => getMilestonesForProject(project), [project]);

  const [invoiceNo, setInvoiceNo] = useState(existingLine?.invoiceNo ?? suggestNextInvoiceNumber(project));
  const [invoiceDate, setInvoiceDate] = useState(existingLine?.invoiceDate ?? todayISODate());
  const [clientReference, setClientReference] = useState(existingLine?.clientReference ?? "");
  const [remarks, setRemarks] = useState(existingLine?.remarks ?? "");
  const [status, setStatus] = useState<InvoiceLineStatus>(existingLine?.status ?? "Pending");

  // Edit/View mode: a single existing line's own quantity.
  const [editQuantityInput, setEditQuantityInput] = useState(
    existingLine ? String(existingLine.quantityBilled) : ""
  );

  // Create mode: one draft row per milestone, or a single free-text row when none are configured.
  const [draftLines, setDraftLines] = useState<DraftLine[]>(() => {
    if (milestones.length > 0) {
      return milestones.map((m) => ({
        key: m.id,
        milestoneId: m.id,
        milestoneLabel: m.label,
        description: m.label,
        quantityInput: "",
        custom: false,
      }));
    }
    return [
      {
        key: "default",
        milestoneId: undefined,
        milestoneLabel: undefined,
        description: item.description,
        quantityInput: "",
        custom: false,
      },
    ];
  });

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const handleClose = () => {
    setShow(false);
    window.setTimeout(onClose, 200);
  };

  const addCustomLine = () => {
    setDraftLines((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        milestoneId: undefined,
        milestoneLabel: undefined,
        description: "",
        quantityInput: "",
        custom: true,
      },
    ]);
  };

  const removeLine = (key: string) => {
    setDraftLines((prev) => prev.filter((line) => line.key !== key));
  };

  const updateLineQty = (key: string, quantity: number) => {
    setDraftLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, quantityInput: quantity === 0 ? "" : String(quantity) } : line))
    );
  };

  const updateLineDescription = (key: string, description: string) => {
    setDraftLines((prev) => prev.map((line) => (line.key === key ? { ...line, description } : line)));
  };

  // Quantity already committed to history, per milestone bucket — excludes
  // the line currently being edited (if any) so it never blocks itself.
  const completedByBucket = useMemo(() => {
    const map: Record<string, number> = {};
    (item.invoices ?? []).forEach((line) => {
      if (line.status === "Cancelled") return;
      if (isEditMode && existingLine && line.id === existingLine.id) return;
      const key = bucketKey(line.milestoneId);
      map[key] = (map[key] ?? 0) + line.quantityBilled;
    });
    return map;
  }, [item.invoices, isEditMode, existingLine]);

  const createRows: InvoiceLineRow[] = draftLines.map((line) => {
    const key = bucketKey(line.milestoneId);
    const completed = completedByBucket[key] ?? 0;
    const otherDraftQtyInBucket = draftLines
      .filter((other) => other.key !== line.key && bucketKey(other.milestoneId) === key)
      .reduce((sum, other) => sum + (Number(other.quantityInput) || 0), 0);
    const maxForThisRow = Math.max(item.qty - completed - otherDraftQtyInBucket, 0);
    const quantity = Number(line.quantityInput) || 0;
    const error = quantity > maxForThisRow + 0.0001
      ? `Cannot exceed the remaining available quantity (${maxForThisRow} ${item.uom}).`
      : null;
    const remainingQty = Math.max(maxForThisRow - quantity, 0);

    return {
      key: line.key,
      description: line.description,
      milestoneLabel: line.milestoneLabel,
      contractQty: item.qty,
      completedQty: completed,
      currentInvoiceQty: quantity,
      unitPrice: item.unitPrice,
      currentInvoiceAmount: calculateLineAmount(quantity, item.unitPrice),
      remainingQty,
      remainingAmount: calculateLineAmount(remainingQty, item.unitPrice),
      error,
      removable: line.custom,
    };
  });

  // Edit/View: a single row built from the existing line.
  const editMaxQty = existingLine ? getEditableMaxQuantity(item, existingLine.id) : 0;
  const editQuantityValue = editQuantityInput.trim() === "" ? 0 : Number(editQuantityInput);
  const editPreview = existingLine ? getLinePreview(item, editQuantityValue, existingLine.id) : null;
  const editError =
    existingLine && editQuantityValue > editMaxQty + 0.0001
      ? `Cannot exceed the remaining available quantity (${editMaxQty} ${item.uom}).`
      : null;

  const editRows: InvoiceLineRow[] = existingLine
    ? [
        {
          key: existingLine.id,
          description: existingLine.description ?? item.description,
          milestoneLabel: existingLine.milestoneName,
          contractQty: item.qty,
          completedQty: completedByBucket[bucketKey(existingLine.milestoneId)] ?? 0,
          currentInvoiceQty: editQuantityValue,
          unitPrice: item.unitPrice,
          currentInvoiceAmount: editPreview?.currentInvoiceAmount ?? 0,
          remainingQty: editPreview?.remainingQty ?? 0,
          remainingAmount: editPreview?.remainingAmount ?? 0,
          error: editError,
          removable: false,
        },
      ]
    : [];

  const rows = isCreateMode ? createRows : editRows;

  const hasBillableLine = isCreateMode
    ? createRows.some((row) => row.currentInvoiceQty > 0 && !row.error)
    : !editError && editQuantityValue > 0;

  const canSave =
    !isViewMode &&
    invoiceNo.trim() !== "" &&
    invoiceDate.trim() !== "" &&
    hasBillableLine;

  const handleQtyInput = (raw: string) => {
    if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return;
    setEditQuantityInput(raw);
  };

  const handleSave = () => {
    if (!canSave) return;

    if (isEditMode && existingLine) {
      const updatedLine: InvoiceLine = {
        ...existingLine,
        invoiceDate,
        quantityBilled: editQuantityValue,
        invoiceAmountINR: calculateLineAmount(editQuantityValue, item.unitPrice),
        clientReference: clientReference.trim() || undefined,
        remarks: remarks.trim() || undefined,
        status,
      };

      onSave({
        ...project,
        invoiceItems: project.invoiceItems.map((invoiceItem) =>
          invoiceItem.id !== item.id
            ? invoiceItem
            : {
                ...invoiceItem,
                invoices: invoiceItem.invoices.map((line) => (line.id === existingLine.id ? updatedLine : line)),
              }
        ),
      });
      handleClose();
      return;
    }

    const newLines: InvoiceLine[] = createRows
      .filter((row) => row.currentInvoiceQty > 0 && !row.error)
      .map((row) => ({
        id: crypto.randomUUID(),
        invoiceNo: invoiceNo.trim(),
        invoiceDate,
        milestoneId: draftLines.find((line) => line.key === row.key)?.milestoneId,
        milestoneName: row.milestoneLabel,
        description: row.milestoneLabel ? undefined : row.description.trim() || item.description,
        quantityBilled: row.currentInvoiceQty,
        invoiceAmountINR: row.currentInvoiceAmount,
        clientReference: clientReference.trim() || undefined,
        remarks: remarks.trim() || undefined,
        status: "Pending",
        createdBy: "Administrator",
      }));

    onSave({
      ...project,
      invoiceItems: project.invoiceItems.map((invoiceItem) =>
        invoiceItem.id !== item.id
          ? invoiceItem
          : { ...invoiceItem, invoices: [...invoiceItem.invoices, ...newLines] }
      ),
    });
    handleClose();
  };

  const title = isViewMode ? "View Invoice" : isEditMode ? "Edit Invoice" : "Raise Invoice";
  const subtitle = item.description;

  return (
    <>
      <div
        role="button"
        aria-label="Close invoice drawer"
        tabIndex={-1}
        onClick={handleClose}
        className={`fixed inset-0 z-40 bg-slate-900/20 transition-opacity duration-200 ${show ? "opacity-100" : "opacity-0"}`}
      />

      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full flex-col bg-[var(--nu-surface)] shadow-2xl transition-transform duration-200 ease-out md:w-[90%] lg:w-[620px] xl:w-[680px] 2xl:w-[760px] ${
          show ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--nu-border)] px-6 py-5">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-[var(--nu-text)]">{title}</h2>
            <p className="mt-1 text-sm text-[var(--nu-text-muted)] truncate">{subtitle}</p>
          </div>
          <button
            onClick={handleClose}
            className="shrink-0 rounded-lg p-2 text-[var(--nu-text-muted)] transition hover:bg-[var(--nu-surface-alt)] hover:text-[var(--nu-text)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-6">
          {/* Invoice Information */}
          <div className="rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] p-4 space-y-4">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-[var(--nu-accent)]" />
              <h4 className="text-sm font-bold text-[var(--nu-text)]">Invoice Information</h4>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Invoice Number</label>
                <Input
                  type="text"
                  value={invoiceNo}
                  disabled={isViewMode}
                  className={disabledFieldClass}
                  placeholder="e.g. INV-001"
                  onChange={(e) => setInvoiceNo(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Invoice Date</label>
                <Input
                  type="date"
                  value={invoiceDate}
                  disabled={isViewMode}
                  className={disabledFieldClass}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Client Reference</label>
                <Input
                  type="text"
                  value={clientReference}
                  disabled={isViewMode}
                  className={disabledFieldClass}
                  placeholder="Optional"
                  onChange={(e) => setClientReference(e.target.value)}
                />
              </div>
              {!isCreateMode && (
                <div>
                  <label className={labelClass}>Status</label>
                  <Select
                    value={status}
                    disabled={isViewMode}
                    className={disabledFieldClass}
                    onChange={(e) => setStatus(e.target.value as InvoiceLineStatus)}
                  >
                    <option value="Pending">Pending</option>
                    <option value="Paid">Paid</option>
                    <option value="Cancelled">Cancelled</option>
                  </Select>
                </div>
              )}
            </div>

            <div>
              <label className={labelClass}>Remarks</label>
              <Textarea
                value={remarks}
                disabled={isViewMode}
                className={`resize-none ${disabledFieldClass}`}
                placeholder="Optional notes for this invoice..."
                rows={2}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </div>
          </div>

          {/* Billable Line Items */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-[var(--nu-text)]">Billable Line Items</h4>
              {isCreateMode && (
                <Button variant="outline" size="sm" icon={<PlusCircle size={13} />} onClick={addCustomLine}>
                  Add Line
                </Button>
              )}
            </div>

            {isCreateMode ? (
              <InvoiceLineTable
                rows={rows}
                uom={item.uom}
                onQtyChange={updateLineQty}
                onDescriptionChange={updateLineDescription}
                onRemoveRow={removeLine}
              />
            ) : (
              <InvoiceLineTable
                rows={rows}
                uom={item.uom}
                disabled={isViewMode}
                onQtyChange={(_key, quantity) => handleQtyInput(quantity === 0 ? "" : String(quantity))}
                onDescriptionChange={() => {}}
                onRemoveRow={() => {}}
              />
            )}

            <p className="text-[11px] text-[var(--nu-text-muted)] leading-snug">
              Milestones shown above are reference information from the Payments tab — you are never required to bill the
              full milestone percentage. Add a custom line for completed deliverables or manual billing stages instead.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-3 border-t border-[var(--nu-border)] px-6 py-4">
          {isViewMode ? (
            <Button variant="secondary" onClick={handleClose} className="w-[140px] py-2.5">
              Close
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={handleClose} className="w-[120px] py-2.5">
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={!canSave}
                className="w-[160px] py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isEditMode ? "Save Changes" : "Save Invoice"}
              </Button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
