import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileText, PlusCircle, X, Lock, Activity, CheckCircle2, ClipboardList,
  ArrowLeft, Receipt, GripVertical, Maximize2, Minimize2, AlertTriangle
} from "lucide-react";

import type { Project } from "../../../../types/Project";
import type { InvoiceItem, InvoiceLine, InvoiceLineStatus } from "../../../../types/InvoiceItem";
import { Button } from "../../../../components/ui/Button";
import { Input } from "../../../../components/ui/Input";
import { Select } from "../../../../components/ui/Select";
import { Textarea } from "../../../../components/ui/Textarea";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { MoneyValue } from "../../../../components/ui/MoneyTooltip";
import { Portal } from "../../../../components/ui/Portal";
import { formatIndianNumber } from "../../../../utils/quantityCalculations";

import {
  diffInvoiceLines,
  logInvoiceUpdatedAudit,
  logInvoiceRaisedAudit,
} from "../../../../services/projectAuditService";
import {
  getMilestonesForProject,
  getMilestoneValue,
  getMilestoneQuantityState,
  getSystemAmount,
  getCommercialAdjustment,
  getPreviousRaisedAmountForMilestone,
  getCommercialBillingStatus,
  suggestNextInvoiceNumber,
  getInvoiceCyclesForProject,
  calculateExecutionProgress,
  getInvoiceWorkflowMode,
  getInvoiceMethod,
  getLumpSumMilestoneRows,
  EDIT_INVOICE_STATUS_OPTIONS,
  INVOICE_LINE_STATUS_LABEL,
  round,
  type InvoiceWorkflowMode,
  type LumpSumMilestoneRow,
} from "./InvoiceCalculations";
import { InvoiceLineTable, type InvoiceLineRow } from "./InvoiceLineTable";
import { LumpSumMilestoneTable } from "./LumpSumMilestoneTable";

interface Props {
  project: Project;
  item: InvoiceItem;
  mode?: "create" | "view" | "edit";
  existingLine?: InvoiceLine;
  /**
   * Lump Sum only — the PROJECT-level Invoice Cycle currently selected on
   * the main Invoice Management page (InvoiceDashboard/InvoiceSummaryPanel).
   * Raise Invoice never computes or offers its own cycle for Lump Sum: every
   * activity billed while this cycle is selected participates in the SAME
   * cycle, exactly like Commercial Milestone Billing's "one invoice can
   * cover multiple activities" — Lump Sum previously (incorrectly) gave each
   * activity its own independent cycle sequence, which is what this prop
   * replaces. Ignored for Commercial Milestone Billing and for Edit/View,
   * which keep using the existing project-wide Invoice Cycle dropdown below.
   */
  projectInvoiceCycle?: string;
  onClose: () => void;
  onSave: (updatedProject: Project) => void;
}

interface DraftLine {
  key: string;
  milestoneId?: string;
  milestoneLabel?: string;
  milestonePercent?: number;
  description: string;
  qtyInput: string;
  customAmountInput?: string;
  custom: boolean;
}

const todayISODate = (): string => new Date().toISOString().slice(0, 10);
const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]";
const disabledFieldClass = "disabled:opacity-60 disabled:cursor-not-allowed";

/**
 * Universal Intelligent PMO Full Invoice Workspace.
 *
 * Converted from a narrow side drawer into a responsive 95% viewport width
 * Full Invoice Workspace while preserving 100% of existing business logic,
 * milestone calculations, commercial adjustments, and state management.
 */
export function RaiseInvoiceDrawer({
  project,
  item,
  mode = "create",
  existingLine,
  projectInvoiceCycle,
  onClose,
  onSave,
}: Props) {
  const [show, setShow] = useState(false);

  const isViewMode = mode === "view";
  const isEditMode = mode === "edit";
  const isCreateMode = mode === "create";

  const milestones = useMemo(() => getMilestonesForProject(project), [project]);
  const workflowMode: InvoiceWorkflowMode = getInvoiceWorkflowMode(milestones);
  const isCommercialMilestone = workflowMode === "commercial_milestone";
  const isLumpSum = getInvoiceMethod(project) === "lump_sum";

  const executionProgress = useMemo(() => calculateExecutionProgress(project, item), [project, item]);
  const executionCompletedQty = executionProgress.completedQty;
  const executionRemainingQty = executionProgress.remainingQty;

  const invoiceCycles = useMemo(() => getInvoiceCyclesForProject(project), [project]);

  const [invoiceNo, setInvoiceNo] = useState(existingLine?.invoiceNo ?? suggestNextInvoiceNumber(project));
  const [invoiceDate, setInvoiceDate] = useState(existingLine?.invoiceDate ?? todayISODate());
  const [clientReference, setClientReference] = useState(existingLine?.clientReference ?? "");
  const [remarks, setRemarks] = useState(existingLine?.remarks ?? "");
  const [status, setStatus] = useState<InvoiceLineStatus>(existingLine?.status ?? "Raised");

  // Edit/View mode states
  const [editQtyInput, setEditQtyInput] = useState(
    existingLine ? String(existingLine.quantityBilled) : ""
  );
  const [editAmountInput, setEditAmountInput] = useState(
    existingLine ? String(existingLine.invoiceAmountINR) : ""
  );

  const [draftLines, setDraftLines] = useState<DraftLine[]>(() => {
    if (milestones.length > 0) {
      return milestones.map((m) => ({
        key: m.id,
        milestoneId: m.id,
        milestoneLabel: m.label,
        milestonePercent: m.percent,
        description: m.label,
        qtyInput: "",
        customAmountInput: undefined,
        custom: false,
      }));
    }
    return [
      {
        key: "default",
        milestoneId: undefined,
        milestoneLabel: "Full Completion",
        milestonePercent: 100,
        description: item.description,
        qtyInput: "",
        customAmountInput: undefined,
        custom: false,
      },
    ];
  });

  // One-time "Confirm Invoice Cycle" safeguard — Invoice Line Items /
  // Commercial Milestone Billing only, Raise Invoice (create mode) only. The
  // first attempt to enter a Qty to Invoice in this session is intercepted
  // rather than applied immediately: the pending change is stashed and a
  // confirmation dialog names the exact cycle it would be saved under.
  // "Continue Billing" applies the stashed change and unlocks the rest of
  // the session; "Change Invoice Cycle" discards it and focuses the cycle
  // dropdown, leaving cycleConfirmed false so the very next attempt asks
  // again. Changing the Invoice Cycle dropdown resets cycleConfirmed, since
  // the billing context just changed — see handleInvoiceCycleChange below.
  //
  // Lump Sum never goes through this gate: its Invoice Cycle is already
  // chosen up front on the Invoice Summary card (read-only inside this
  // drawer, sourced from `projectInvoiceCycle`), so by the time "Raise
  // Invoice" is clicked there is no ambiguity left to confirm — repeating it
  // here would just be a redundant, confusing popup.
  const [cycleConfirmed, setCycleConfirmed] = useState(false);
  const [showCycleConfirmDialog, setShowCycleConfirmDialog] = useState(false);
  const pendingQtyActionRef = useRef<(() => void) | null>(null);

  const guardedQtyEntry = (apply: () => void) => {
    if (!isCreateMode || isLumpSum || cycleConfirmed) {
      apply();
      return;
    }
    pendingQtyActionRef.current = apply;
    setShowCycleConfirmDialog(true);
  };

  const handleContinueBilling = () => {
    setShowCycleConfirmDialog(false);
    setCycleConfirmed(true);
    const pending = pendingQtyActionRef.current;
    pendingQtyActionRef.current = null;
    pending?.();
  };

  const handleChangeInvoiceCycleFromDialog = () => {
    setShowCycleConfirmDialog(false);
    pendingQtyActionRef.current = null;
    document.getElementById("raise-invoice-cycle-select")?.focus();
  };

  const savedScrollYRef = useRef<number>(0);

  useEffect(() => {
    savedScrollYRef.current = window.scrollY;
    const frame = requestAnimationFrame(() => setShow(true));
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = "";
      window.scrollTo({ top: savedScrollYRef.current, behavior: "instant" });
    };
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
        milestonePercent: 100,
        description: "",
        qtyInput: "",
        customAmountInput: undefined,
        custom: true,
      },
    ]);
  };

  const removeLine = (key: string) => {
    setDraftLines((prev) => prev.filter((line) => line.key !== key));
  };

  const updateLineQty = (key: string, qty: number) => {
    guardedQtyEntry(() => {
      setDraftLines((prev) =>
        prev.map((line) =>
          line.key === key
            ? {
                ...line,
                qtyInput: qty === 0 ? "" : String(qty),
                customAmountInput: qty === 0 ? undefined : line.customAmountInput,
              }
            : line
        )
      );
    });
  };

  const updateLineAmount = (key: string, amount: number) => {
    setDraftLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, customAmountInput: amount === 0 ? "" : String(amount) } : line))
    );
  };

  const updateLineDescription = (key: string, description: string) => {
    setDraftLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, description } : line))
    );
  };

  const createRows: InvoiceLineRow[] = draftLines.map((line) => {
    const milestonePercent = line.milestonePercent ?? (line.milestoneId ? milestones.find((m) => m.id === line.milestoneId)?.percent ?? 100 : 100);
    const milestoneValue = getMilestoneValue(item.totalPrice, milestonePercent);
    const previousRaisedAmount = getPreviousRaisedAmountForMilestone(item, line.milestoneId);

    const { ceiling: qtyCeiling, alreadyInvoiced: qtyAlreadyInvoiced, available: baseAvailable } = getMilestoneQuantityState(item, line.milestoneId);

    const otherDraftQtyInSession = draftLines
      .filter((other) => other.key !== line.key && other.milestoneId === line.milestoneId)
      .reduce((sum, other) => sum + (Number(other.qtyInput) || 0), 0);
    const eligibleQty = Math.max(round(baseAvailable - otherDraftQtyInSession), 0);

    const qtyToBill = Number(line.qtyInput) || 0;
    const calculatedAmount = getSystemAmount(qtyToBill, item.unitPrice, milestonePercent);
    const currentInvoiceAmount = line.customAmountInput !== undefined && line.customAmountInput !== ""
      ? Number(line.customAmountInput)
      : calculatedAmount;

    const commercialAdjustment = getCommercialAdjustment(currentInvoiceAmount, calculatedAmount);
    const remainingQty = Math.max(eligibleQty - qtyToBill, 0);
    const remainingAmount = Math.max(milestoneValue - (previousRaisedAmount + currentInvoiceAmount), 0);

    let error: string | null = null;
    if (item.qty <= 0) {
      error = "Contract qty is 0. Not eligible.";
    } else if (qtyToBill < 0) {
      error = "Qty to invoice cannot be negative.";
    } else if (qtyToBill > eligibleQty + 0.001) {
      error = `Qty to invoice cannot exceed available qty (${eligibleQty} ${item.uom}).`;
    } else if (currentInvoiceAmount < 0) {
      error = "Invoice amount cannot be negative.";
    }

    const billingStatus = getCommercialBillingStatus(item.qty, milestoneValue, previousRaisedAmount + currentInvoiceAmount);

    return {
      key: line.key,
      description: line.description,
      milestoneLabel: line.milestoneLabel,
      milestonePercent,
      contractQty: item.qty,
      completedQty: qtyCeiling,
      previousQtyInvoiced: qtyAlreadyInvoiced,
      eligibleQty,
      qtyToBill,
      unitPrice: item.unitPrice,
      milestoneValue,
      calculatedAmount,
      currentInvoiceAmount,
      commercialAdjustment,
      previousRaisedAmount,
      remainingQty,
      remainingAmount,
      status: billingStatus,
      error,
      removable: line.custom,
    };
  });

  const editQtyValue = Number(editQtyInput) || 0;
  const editMilestone = existingLine?.milestoneId ? milestones.find((m) => m.id === existingLine.milestoneId) : undefined;
  const editMilestonePercent = editMilestone?.percent ?? 100;
  const editMilestoneValue = getMilestoneValue(item.totalPrice, editMilestonePercent);
  const editPreviousRaisedAmount = getPreviousRaisedAmountForMilestone(item, existingLine?.milestoneId, existingLine?.id);

  const { ceiling: editQtyCeiling, alreadyInvoiced: editQtyAlreadyInvoiced, available: editEligibleQty } = getMilestoneQuantityState(
    item,
    existingLine?.milestoneId,
    existingLine?.id
  );

  const editCalculatedAmount = getSystemAmount(editQtyValue, item.unitPrice, editMilestonePercent);
  const editAmountValue = editAmountInput !== "" ? Number(editAmountInput) : editCalculatedAmount;
  const editCommercialAdjustment = getCommercialAdjustment(editAmountValue, editCalculatedAmount);

  let editError: string | null = null;
  if (editQtyValue < 0) {
    editError = "Qty to invoice cannot be negative.";
  } else if (editQtyValue > editEligibleQty + 0.001) {
    editError = `Qty to invoice cannot exceed available qty (${editEligibleQty} ${item.uom}).`;
  } else if (editAmountValue < 0) {
    editError = "Invoice amount cannot be negative.";
  }

  const editRows: InvoiceLineRow[] = existingLine
    ? [
        {
          key: existingLine.id,
          description: existingLine.description ?? item.description,
          milestoneLabel: existingLine.milestoneName ?? editMilestone?.label ?? "Full Completion",
          milestonePercent: editMilestonePercent,
          contractQty: item.qty,
          completedQty: editQtyCeiling,
          previousQtyInvoiced: editQtyAlreadyInvoiced,
          eligibleQty: editEligibleQty,
          qtyToBill: editQtyValue,
          unitPrice: item.unitPrice,
          milestoneValue: editMilestoneValue,
          calculatedAmount: editCalculatedAmount,
          currentInvoiceAmount: editAmountValue,
          commercialAdjustment: editCommercialAdjustment,
          previousRaisedAmount: editPreviousRaisedAmount,
          remainingQty: Math.max(editEligibleQty - editQtyValue, 0),
          remainingAmount: Math.max(editMilestoneValue - (editPreviousRaisedAmount + editAmountValue), 0),
          status: getCommercialBillingStatus(item.qty, editMilestoneValue, editPreviousRaisedAmount + editAmountValue),
          error: editError,
          removable: false,
        },
      ]
    : [];

  const [selectedMilestoneIds, setSelectedMilestoneIds] = useState<Set<string>>(() => new Set());
  const lumpSumRows = useMemo(() => getLumpSumMilestoneRows(item, milestones), [item, milestones]);

  const toggleLumpSumMilestone = (id: string) => {
    guardedQtyEntry(() => {
      setSelectedMilestoneIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    });
  };

  const editLumpSumRows: LumpSumMilestoneRow[] = useMemo(() => {
    if (!existingLine) return [];
    const milestone = existingLine.milestoneId ? milestones.find((m) => m.id === existingLine.milestoneId) : undefined;
    return [
      {
        id: existingLine.milestoneId ?? existingLine.id,
        label: existingLine.milestoneName ?? milestone?.label ?? "—",
        percent: milestone?.percent ?? 0,
        invoiceAmount: existingLine.invoiceAmountINR,
        alreadyInvoiced: true,
        status: "Completed",
      },
    ];
  }, [existingLine, milestones]);

  const lumpSumDisplayRows = isCreateMode ? lumpSumRows : editLumpSumRows;

  const hasLumpSumSelection = lumpSumRows.some((row) => !row.alreadyInvoiced && selectedMilestoneIds.has(row.id));

  // Invoice Line Items / Commercial Milestone Billing — unchanged, original
  // behavior: the Billable Line Items Table is always the live editable
  // draft in create mode (Accounts can join any existing project-wide cycle
  // or start a new one via the dropdown below; the table itself never
  // becomes a read-only per-cycle snapshot).
  const rows = isCreateMode ? createRows : editRows;

  // Lump Sum's own Invoice Cycle is PROJECT-level, not computed here at all —
  // it's whatever cycle is currently selected on the main Invoice Management
  // page (InvoiceDashboard → InvoiceSummaryPanel), passed in as
  // `projectInvoiceCycle`. Every activity billed while that cycle is
  // selected shares the SAME invoiceNo, exactly like Commercial Milestone
  // Billing's project-wide cycles always have. Falls back to the next fresh
  // number only if the parent didn't pass one (defensive; InvoiceDashboard
  // always does for Lump Sum projects).
  const effectiveInvoiceNo = isLumpSum && isCreateMode
    ? (projectInvoiceCycle ?? suggestNextInvoiceNumber(project))
    : invoiceNo;

  // Human-readable label for that project cycle (e.g. "Invoice 2
  // (PR-11040_3-INV-002)"), reusing the exact same project-wide sequence
  // Invoice Summary and Invoice History label cycles with — one shared
  // source of truth, never a separately-computed label.
  const projectInvoiceCycleLabel = useMemo(() => {
    if (!(isLumpSum && isCreateMode)) return "";
    const match = invoiceCycles.find((cycle) => cycle.invoiceNo === effectiveInvoiceNo && !cycle.isNew);
    if (match) return `${match.label} (${match.invoiceNo})`;
    const realCycleCount = invoiceCycles.filter((cycle) => !cycle.isNew).length;
    return `Invoice ${realCycleCount + 1} (New)`;
  }, [isLumpSum, isCreateMode, invoiceCycles, effectiveInvoiceNo]);

  // Same labeling logic as projectInvoiceCycleLabel above, generalized to
  // whichever cycle is actually active in create mode (the project-level one
  // for Lump Sum, or the dropdown's own selection for Invoice Line Items /
  // Commercial Milestone Billing) — this is what the "Confirm Invoice Cycle"
  // dialog names, so it always matches what the Invoice Cycle field shows.
  const activeCreateCycleNo = isLumpSum ? effectiveInvoiceNo : invoiceNo;
  const cycleConfirmationLabel = useMemo(() => {
    if (!isCreateMode) return "";
    const match = invoiceCycles.find((cycle) => cycle.invoiceNo === activeCreateCycleNo && !cycle.isNew);
    if (match) return `${match.label} (${match.invoiceNo})`;
    const realCycleCount = invoiceCycles.filter((cycle) => !cycle.isNew).length;
    return `Invoice ${realCycleCount + 1} (New)`;
  }, [isCreateMode, invoiceCycles, activeCreateCycleNo]);

  const handleInvoiceCycleChange = (value: string) => {
    setInvoiceNo(value);
    const selected = invoiceCycles.find((cycle) => cycle.invoiceNo === value);
    if (selected && !selected.isNew && selected.invoiceDate) {
      setInvoiceDate(selected.invoiceDate);
    }
    // The billing context just changed — re-ask before the next Qty entry,
    // even if the user had already confirmed the previous cycle this session.
    setCycleConfirmed(false);
  };

  const hasBillableLine = isLumpSum
    ? (isCreateMode ? hasLumpSumSelection : !!existingLine)
    : isCreateMode
      ? createRows.some((row) => row.qtyToBill > 0 && !row.error)
      : editQtyValue > 0 && !editRows[0]?.error;

  const canSave =
    !isViewMode &&
    effectiveInvoiceNo.trim() !== "" &&
    invoiceDate.trim() !== "" &&
    hasBillableLine;

  const handleSave = () => {
    if (!canSave) return;

    if (isEditMode && existingLine) {
      const updatedLine: InvoiceLine = isLumpSum
        ? {
            ...existingLine,
            invoiceNo: invoiceNo.trim(),
            invoiceDate,
            clientReference: clientReference.trim() || undefined,
            remarks: remarks.trim() || undefined,
            status,
          }
        : {
            ...existingLine,
            invoiceNo: invoiceNo.trim(),
            invoiceDate,
            quantityBilled: editQtyValue,
            unitPriceINR: existingLine.unitPriceINR ?? item.unitPrice,
            calculatedAmountINR: editCalculatedAmount,
            invoiceAmountINR: editAmountValue,
            commercialAdjustmentINR: editCommercialAdjustment,
            clientReference: clientReference.trim() || undefined,
            remarks: remarks.trim() || undefined,
            status,
          };

      const changes = diffInvoiceLines(existingLine, updatedLine);
      if (changes.length > 0) {
        logInvoiceUpdatedAudit(project.id, updatedLine.invoiceNo, changes, "Administrator");
      }

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

    const newLines: InvoiceLine[] = isLumpSum
      ? lumpSumRows
          .filter((row) => !row.alreadyInvoiced && selectedMilestoneIds.has(row.id))
          .map((row) => ({
            id: crypto.randomUUID(),
            invoiceNo: effectiveInvoiceNo.trim(),
            invoiceDate,
            milestoneId: row.id,
            milestoneName: row.label,
            quantityBilled: 0,
            calculatedAmountINR: row.invoiceAmount,
            invoiceAmountINR: row.invoiceAmount,
            commercialAdjustmentINR: 0,
            clientReference: clientReference.trim() || undefined,
            remarks: remarks.trim() || undefined,
            status: "Raised",
            createdBy: "Administrator",
          }))
      : createRows
          .filter((row) => row.qtyToBill > 0 && !row.error)
          .map((row) => ({
            id: crypto.randomUUID(),
            invoiceNo: effectiveInvoiceNo.trim(),
            invoiceDate,
            milestoneId: draftLines.find((line) => line.key === row.key)?.milestoneId,
            milestoneName: row.milestoneLabel,
            description: row.milestoneLabel ? undefined : row.description.trim() || item.description,
            quantityBilled: row.qtyToBill,
            unitPriceINR: item.unitPrice,
            calculatedAmountINR: row.calculatedAmount,
            invoiceAmountINR: row.currentInvoiceAmount,
            commercialAdjustmentINR: row.commercialAdjustment,
            clientReference: clientReference.trim() || undefined,
            remarks: remarks.trim() || undefined,
            status: "Raised",
            createdBy: "Administrator",
          }));

    const totalInvoiceAmount = newLines.reduce((sum, line) => sum + line.invoiceAmountINR, 0);
    if (newLines.length > 0) {
      logInvoiceRaisedAudit(
        project.id,
        effectiveInvoiceNo.trim(),
        invoiceDate,
        totalInvoiceAmount,
        newLines.length,
        "Administrator"
      );
    }

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

  // Window Mode State: "floating" (default) vs "maximized"
  const [isMaximized, setIsMaximized] = useState(false);

  // Draggable Floating Workspace (Direct DOM Mutation — Zero React Re-renders)
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const dragPosRef = useRef({ x: 0, y: 0 });

  // Auto-switch to maximized mode on small screens (<768px) and re-clamp position on resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setIsMaximized(true);
      }

      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const currentX = dragPosRef.current.x;
      const currentY = dragPosRef.current.y;

      const minX = -rect.left + currentX;
      const maxX = window.innerWidth - rect.right + currentX;
      const minY = -rect.top + currentY;
      const maxY = window.innerHeight - rect.bottom + currentY;

      const clampedX = Math.max(minX, Math.min(maxX, currentX));
      const clampedY = Math.max(minY, Math.min(maxY, currentY));

      if (clampedX !== currentX || clampedY !== currentY) {
        dragPosRef.current = { x: clampedX, y: clampedY };
        containerRef.current.style.transform = `translate3d(${clampedX}px, ${clampedY}px, 0px)`;
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Recenters the floating window and scrolls its own body back to top when
  // MAXIMIZE is toggled on an already-mounted workspace (available scroll
  // height changes). Raise/Edit/View workspaces always start centered at
  // scrollTop 0 on their own regardless: RaiseInvoiceDrawer is unmounted on
  // close ({drawerState && ... && <RaiseInvoiceDrawer .../>} in
  // InvoiceDashboard), so opening it again is always a brand-new DOM node —
  // dragPosRef/containerRef/bodyRef all start at their fresh initial values,
  // no polling/setTimeout loop needed to force that.
  const toggleMaximize = () => {
    dragPosRef.current = { x: 0, y: 0 };
    if (containerRef.current) {
      containerRef.current.style.transform = "translate3d(0px, 0px, 0px)";
    }
    if (bodyRef.current) {
      bodyRef.current.scrollTop = 0;
    }
    setIsMaximized((prev) => !prev);
  };

  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isMaximized) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, input, select, textarea, a")) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const initialX = dragPosRef.current.x;
    const initialY = dragPosRef.current.y;

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!containerRef.current) return;

      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      const candidateX = initialX + deltaX;
      const candidateY = initialY + deltaY;

      const rect = containerRef.current.getBoundingClientRect();
      const currentX = dragPosRef.current.x;
      const currentY = dragPosRef.current.y;

      const minX = -rect.left + currentX;
      const maxX = window.innerWidth - rect.right + currentX;
      const minY = -rect.top + currentY;
      const maxY = window.innerHeight - rect.bottom + currentY;

      const clampedX = Math.max(minX, Math.min(maxX, candidateX));
      const clampedY = Math.max(minY, Math.min(maxY, candidateY));

      dragPosRef.current = { x: clampedX, y: clampedY };
      containerRef.current.style.transform = `translate3d(${clampedX}px, ${clampedY}px, 0px)`;
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", onPointerUp);
  };

  return (
    <>
    {/* Rendered directly into document.body — a true application modal must
    never be a descendant of the Project page's own layout. Mounting it
    inline (like every other page section) puts it under ancestors this
    component doesn't control, and any one of them gaining a `transform`/
    `filter`/`perspective`/`will-change: transform` (as MainLayout's own
    page-entry animation did — see the pmoFadeUp fix in index.css) creates
    a new containing block for every `position: fixed` descendant, so the
    "fixed" backdrop below silently starts behaving like `position:
    absolute` relative to that ancestor's full scrollable height instead
    of the viewport — which is exactly what made this workspace open at
    wherever the Project page happened to be scrolled. The portal makes
    that entire class of bug structurally impossible: this subtree has no
    ancestor but <body>, so it is always fixed to the real viewport,
    regardless of parent scroll position or accordion state. */}
    <Portal>
      {/* Dimmed Overlay Backdrop */}
      <div
        onClick={handleClose}
        className={`fixed top-0 left-0 right-0 bottom-0 z-50 bg-slate-950/75 backdrop-blur-sm transition-opacity duration-200 flex items-center justify-center p-2 sm:p-3 overflow-hidden ${
          show ? "opacity-100" : "opacity-0"
        }`}
      >
        {/* Full Invoice Workspace Modal Container */}
        <aside
          ref={containerRef}
          onClick={(e) => e.stopPropagation()}
          className={`relative z-50 flex flex-col bg-[var(--nu-surface)] shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 transition-all duration-200 ease-out ${
            isMaximized
              ? "w-[99vw] h-[98vh] max-h-[98vh] rounded-xl border-slate-300 dark:border-slate-700"
              : "w-[min(90vw,1500px)] h-[min(88vh,860px)] max-h-[calc(100vh-2rem)] rounded-2xl"
          } ${show ? "scale-100 opacity-100" : "scale-95 opacity-0"}`}
        >
          {/* ════════ WORKSPACE DRAGGABLE FIXED HEADER ════════ */}
          <div
            onPointerDown={handleHeaderPointerDown}
            className={`flex items-center justify-between gap-4 border-b border-[var(--nu-border)] px-6 py-3.5 shrink-0 bg-white dark:bg-slate-900 select-none transition-colors ${
              isMaximized ? "cursor-default" : "cursor-grab active:cursor-grabbing hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
            }`}
          >
            <div className="flex items-center gap-3.5 min-w-0">
              {!isMaximized && (
                <div
                  className="p-1 rounded-md text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 cursor-grab active:cursor-grabbing transition-colors"
                  title="Drag title bar to reposition workspace"
                >
                  <GripVertical size={18} />
                </div>
              )}

              <button
                type="button"
                onClick={handleClose}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
              >
                <ArrowLeft size={14} />
                <span>Back to Project</span>
              </button>

              <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 shrink-0" />

              <div className={`min-w-0 ${isMaximized ? "" : "cursor-grab active:cursor-grabbing"}`}>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-lg sm:text-xl font-extrabold text-[var(--nu-text)] tracking-tight truncate">
                    {title}
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800 text-[10.5px] font-bold uppercase tracking-wider shrink-0">
                    {isLumpSum ? "Lump Sum Billing" : isCommercialMilestone ? "Commercial Milestone Billing" : "Quantity-Driven Billing"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-[var(--nu-text-muted)] truncate">{subtitle}</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={toggleMaximize}
                className="rounded-xl p-2 text-[var(--nu-text-muted)] transition hover:bg-[var(--nu-surface-alt)] hover:text-[var(--nu-text)] cursor-pointer"
                title={isMaximized ? "Restore workspace size" : "Maximize workspace"}
                aria-label={isMaximized ? "Restore workspace size" : "Maximize workspace"}
              >
                {isMaximized ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>

              <button
                type="button"
                onClick={handleClose}
                className="rounded-xl p-2 text-[var(--nu-text-muted)] transition hover:bg-[var(--nu-surface-alt)] hover:text-[var(--nu-text)] cursor-pointer"
                aria-label="Close workspace"
                title="Close workspace"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* ════════ WORKSPACE INDEPENDENTLY SCROLLING BODY ════════ */}
          <div ref={bodyRef} className="flex-1 min-h-0 space-y-6 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8 custom-scrollbar">

            {/* ═══ SECTION 1: Execution Progress (PMO Source of Truth - Read Only) ═══ */}
            {!isLumpSum && (
              <div className="rounded-2xl border border-blue-200/80 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity size={16} className="text-blue-600 dark:text-blue-400" />
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-blue-900 dark:text-blue-200">
                      Execution Progress (PMO Data)
                    </h4>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[10.5px] font-bold">
                    <Lock size={11} /> Read Only for Accounts
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
                  <div className="bg-white/80 dark:bg-slate-900/60 rounded-xl p-3 border border-blue-100 dark:border-blue-900/40">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Contract Qty</p>
                    <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mt-0.5">
                      {formatIndianNumber(item.qty)} <span className="text-[10.5px] font-medium text-slate-500">{item.uom}</span>
                    </p>
                  </div>

                  <div className="bg-white/80 dark:bg-slate-900/60 rounded-xl p-3 border border-emerald-200/60 dark:border-emerald-900/40">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 size={10} /> Completed Qty
                    </p>
                    <p className="text-sm font-extrabold text-emerald-700 dark:text-emerald-300 mt-0.5">
                      {formatIndianNumber(executionCompletedQty)} <span className="text-[10.5px] font-medium text-slate-500">{item.uom}</span>
                    </p>
                  </div>

                  <div className="bg-white/80 dark:bg-slate-900/60 rounded-xl p-3 border border-slate-200 dark:border-slate-800">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Remaining Qty</p>
                    <p className="text-sm font-extrabold text-slate-700 dark:text-slate-300 mt-0.5">
                      {formatIndianNumber(executionRemainingQty)} <span className="text-[10.5px] font-medium text-slate-500">{item.uom}</span>
                    </p>
                  </div>

                  <div className="bg-white/80 dark:bg-slate-900/60 rounded-xl p-3 border border-slate-200 dark:border-slate-800">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Unit Rate</p>
                    <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mt-0.5">
                      <MoneyValue value={item.unitPrice} />/{item.uom}
                    </p>
                  </div>

                  <div className="bg-white/80 dark:bg-slate-900/60 rounded-xl p-3 border border-slate-200 dark:border-slate-800 col-span-2 sm:col-span-1">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Work Order Value</p>
                    <p className="text-sm font-extrabold text-cyan-600 dark:text-cyan-400 mt-0.5">
                      <MoneyValue value={item.totalPrice} />
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ═══ SECTION 2: Invoice Information ═══ */}
            <div className="rounded-2xl border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] p-5 space-y-4 shadow-2xs">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-[var(--nu-accent)]" />
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">Invoice Header Details</h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className={labelClass}>Invoice Cycle</label>
                  {isCreateMode && isLumpSum ? (
                    // Lump Sum: PROJECT-level cycle, chosen on the main
                    // Invoice Management page — not editable from inside
                    // this per-activity dialog. Every activity billed while
                    // that cycle is selected shares this exact invoiceNo.
                    <Select id="raise-invoice-cycle-select" value={effectiveInvoiceNo} disabled className={disabledFieldClass}>
                      <option value={effectiveInvoiceNo}>{projectInvoiceCycleLabel}</option>
                    </Select>
                  ) : isCreateMode ? (
                    <Select
                      id="raise-invoice-cycle-select"
                      value={invoiceNo}
                      onChange={(e) => handleInvoiceCycleChange(e.target.value)}
                    >
                      {invoiceCycles.map((cycle) => (
                        <option key={cycle.invoiceNo} value={cycle.invoiceNo}>
                          {cycle.label} {cycle.isNew ? "(New)" : `— ${cycle.invoiceNo}`}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Select
                      value={invoiceNo}
                      disabled={isViewMode}
                      className={disabledFieldClass}
                      onChange={(e) => handleInvoiceCycleChange(e.target.value)}
                    >
                      {invoiceCycles.map((cycle) => (
                        <option key={cycle.invoiceNo} value={cycle.invoiceNo}>
                          {cycle.label} {cycle.isNew ? "(New)" : `— ${cycle.invoiceNo}`}
                        </option>
                      ))}
                    </Select>
                  )}
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
                  <label className={labelClass}>Client Reference / PO Ref</label>
                  <Input
                    type="text"
                    value={clientReference}
                    disabled={isViewMode}
                    className={disabledFieldClass}
                    placeholder="Optional PO Reference"
                    onChange={(e) => setClientReference(e.target.value)}
                  />
                </div>

                {!isCreateMode && (
                  <div>
                    <label className={labelClass}>Invoice Status</label>
                    <Select
                      value={status}
                      disabled={isViewMode}
                      className={disabledFieldClass}
                      onChange={(e) => setStatus(e.target.value as InvoiceLineStatus)}
                    >
                      {EDIT_INVOICE_STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {INVOICE_LINE_STATUS_LABEL[option]}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
              </div>

              <div>
                <label className={labelClass}>Remarks / Internal Notes</label>
                <Textarea
                  value={remarks}
                  disabled={isViewMode}
                  className={`resize-none ${disabledFieldClass}`}
                  placeholder="Optional billing notes..."
                  rows={2}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </div>
            </div>

            {/* ═══ SECTION 3: Billable Line Items Table (Expanded Workspace Horizontal Space) ═══ */}
            {isLumpSum ? (
              <div className="space-y-3">
                <div>
                  <h4 className="text-sm font-extrabold text-[var(--nu-text)]">Payment Milestones</h4>
                  <p className="text-[11.5px] text-[var(--nu-text-muted)] mt-0.5">
                    Lump Sum Billing — check a milestone to automatically invoice <strong className="text-cyan-600 dark:text-cyan-400">Contract Value × Milestone %</strong>. No quantity entry required.
                  </p>
                </div>

                {lumpSumDisplayRows.length === 0 ? (
                  <div className="rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-white dark:bg-slate-900/60">
                    <EmptyState
                      icon={<ClipboardList size={20} />}
                      title="No Payment Milestones Configured"
                      description="Define payment milestones for this project in the Payments tab before raising a Lump Sum invoice."
                    />
                  </div>
                ) : (
                  <LumpSumMilestoneTable
                    rows={lumpSumDisplayRows}
                    selectedIds={isCreateMode ? selectedMilestoneIds : new Set(editLumpSumRows.map((row) => row.id))}
                    onToggle={toggleLumpSumMilestone}
                    disabled={!isCreateMode}
                  />
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-extrabold text-[var(--nu-text)]">Billable Line Items Table</h4>
                    <p className="text-[11.5px] text-[var(--nu-text-muted)] mt-0.5">
                      {isCommercialMilestone ? (
                        <span>Auto-Detected: <strong className="text-cyan-600 dark:text-cyan-400">Commercial Milestone Billing</strong> (Accounts enters Qty to Invoice against each milestone's Available Qty).</span>
                      ) : (
                        <span>Auto-Detected: <strong className="text-blue-600 dark:text-blue-400">Quantity-Driven Billing</strong> (Accounts enters Bill Qty).</span>
                      )}
                    </p>
                  </div>
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
                    onQtyToBillChange={updateLineQty}
                    onInvoiceAmountChange={updateLineAmount}
                    onDescriptionChange={updateLineDescription}
                    onRemoveRow={removeLine}
                  />
                ) : (
                  <InvoiceLineTable
                    rows={rows}
                    uom={item.uom}
                    disabled={isViewMode}
                    onQtyToBillChange={(_key, qty) => setEditQtyInput(qty === 0 ? "" : String(qty))}
                    onInvoiceAmountChange={(_key, amount) => setEditAmountInput(amount === 0 ? "" : String(amount))}
                    onDescriptionChange={() => {}}
                    onRemoveRow={() => {}}
                  />
                )}

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-[11px] text-[var(--nu-text-muted)] leading-relaxed space-y-1">
                  <p>
                    <strong>Intelligent PMO Engine:</strong> The system automatically selects the invoice layout based on contract type (Quantity vs Milestone).
                  </p>
                  <p>
                    PM Execution Data is read-only. Enter Qty to Invoice to calculate the System Amount — Invoice Amount then pre-fills from it and stays editable for a commercial adjustment.
                  </p>
                </div>
              </div>
            )}

            {/* ═══ SECTION 4: Workspace Invoice Summary ═══ */}
            <div className="rounded-2xl border border-blue-200/80 dark:border-slate-800 bg-gradient-to-r from-blue-50/50 via-cyan-50/20 to-blue-50/50 dark:from-slate-900/80 dark:via-slate-900/50 dark:to-slate-900/80 p-5 space-y-3.5">
              <div className="flex items-center gap-2">
                <Receipt size={16} className="text-blue-600 dark:text-cyan-400" />
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
                  Invoice Workspace Summary
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white/80 dark:bg-slate-900/80 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Base System Total</p>
                  <p className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                    <MoneyValue value={isLumpSum ? (isCreateMode ? lumpSumRows.filter(r => !r.alreadyInvoiced && selectedMilestoneIds.has(r.id)).reduce((sum, r) => sum + r.invoiceAmount, 0) : editLumpSumRows.reduce((sum, r) => sum + r.invoiceAmount, 0)) : rows.reduce((sum, r) => sum + r.calculatedAmount, 0)} />
                  </p>
                </div>

                <div className="bg-white/80 dark:bg-slate-900/80 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Commercial Adjustment</p>
                  <p className="text-base font-extrabold text-slate-700 dark:text-slate-300 mt-0.5 tabular-nums">
                    <MoneyValue value={isLumpSum ? 0 : rows.reduce((sum, r) => sum + r.commercialAdjustment, 0)} />
                  </p>
                </div>

                <div className="bg-white/90 dark:bg-slate-900/90 p-3.5 rounded-xl border border-blue-300 dark:border-cyan-800">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 dark:text-cyan-400">Final Invoice Amount</p>
                  <p className="text-lg font-black text-blue-700 dark:text-cyan-300 mt-0.5 tabular-nums">
                    <MoneyValue value={isLumpSum ? (isCreateMode ? lumpSumRows.filter(r => !r.alreadyInvoiced && selectedMilestoneIds.has(r.id)).reduce((sum, r) => sum + r.invoiceAmount, 0) : editLumpSumRows.reduce((sum, r) => sum + r.invoiceAmount, 0)) : rows.reduce((sum, r) => sum + r.currentInvoiceAmount, 0)} />
                  </p>
                </div>
              </div>
            </div>

          </div>

          {/* ════════ WORKSPACE FIXED FOOTER ════════ */}
          <div className="flex shrink-0 justify-between items-center gap-3 border-t border-[var(--nu-border)] px-6 py-4 bg-white dark:bg-slate-900">
            <Button
              variant="secondary"
              onClick={handleClose}
              icon={<ArrowLeft size={14} />}
              className="px-4 py-2.5"
            >
              Back to Project
            </Button>

            <div className="flex items-center gap-2.5">
              {isViewMode ? (
                <Button variant="secondary" onClick={handleClose} className="px-5 py-2.5">
                  Close Workspace
                </Button>
              ) : (
                <>
                  <Button variant="secondary" onClick={handleClose} className="px-4 py-2.5">
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleSave}
                    disabled={!canSave}
                    className="px-6 py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isEditMode ? "Save Changes" : "Save Invoice"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </aside>
      </div>
    </Portal>

    {/* One-time "Confirm Invoice Cycle" safeguard — see guardedQtyEntry
    above. A second, higher-stacked Portal instance so it always paints on
    top of the workspace's own backdrop regardless of maximize state. */}
    {showCycleConfirmDialog && (
      <Portal>
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />

          <div className="relative w-full max-w-md bg-white dark:bg-[#1E293B] border border-gray-250 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden p-6">
            <div className="flex items-center gap-2 pb-4 border-b border-gray-200 dark:border-slate-700">
              <AlertTriangle className="text-amber-500" size={20} />
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Confirm Invoice Cycle</h3>
            </div>

            <div className="py-5 space-y-3">
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                You are about to bill against:
              </p>

              <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/60 dark:bg-blue-950/20 px-4 py-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-blue-600 dark:text-cyan-400">Invoice Cycle</p>
                <p className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">{cycleConfirmationLabel}</p>
              </div>

              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                All quantities entered in this session will be saved under this Invoice Cycle.
              </p>

              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 leading-relaxed">
                Please confirm that you want to continue. If you intended to bill another invoice, change the Invoice Cycle before proceeding.
              </p>
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-slate-700 gap-3">
              <Button variant="secondary" onClick={handleChangeInvoiceCycleFromDialog}>
                Change Invoice Cycle
              </Button>
              <Button variant="primary" onClick={handleContinueBilling}>
                Continue Billing
              </Button>
            </div>
          </div>
        </div>
      </Portal>
    )}
    </>
  );
}
