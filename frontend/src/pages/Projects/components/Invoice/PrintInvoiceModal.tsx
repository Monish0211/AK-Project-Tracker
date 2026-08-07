import { useState, useMemo, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Printer, Eye, X, FileText, ArrowLeft, Building2, Landmark } from "lucide-react";

import type { Project } from "../../../../types/Project";
import type { InvoiceDocumentDetails, BuyerInformation } from "../../../../types/InvoiceDocument";
import {
  getInvoiceCyclesForProject,
  getInvoiceCycleStatus,
  getInvoiceMethod,
  INVOICE_LINE_STATUS_LABEL,
  INVOICE_LINE_STATUS_TONE,
} from "./InvoiceCalculations";
import { Badge } from "../../../../components/ui/Badge";
import { formatBusinessINR } from "../../../../utils/formatCurrency";
import { invoiceDocumentService } from "../../../../services/invoice/invoiceDocumentService";
import {
  mapProjectToInvoiceDocumentDTO,
  mapProjectToLumpSumInvoiceDocumentDTO,
  mapProjectToMlmpInvoiceDocumentDTO,
  mapProjectToAmountBasedInvoiceDocumentDTO,
} from "../../../../services/invoice/invoiceDocumentMapper";
import { InvoiceDocumentView } from "./InvoiceDocumentView";
import { printComponentElement } from "../../../../utils/printComponent";

interface Props {
  project: Project;
  setProject?: Dispatch<SetStateAction<Project>>;
  initialInvoiceNo?: string | null;
  onClose: () => void;
}

export function PrintInvoiceModal({ project, setProject, initialInvoiceNo, onClose }: Props) {
  // All cycles for the project
  const cycles = useMemo(() => {
    return getInvoiceCyclesForProject(project).map((cycle) => {
      const items = Array.isArray(project.invoiceItems) ? project.invoiceItems : [];
      let totalAmount = 0;
      let lineCount = 0;

      items.forEach((item) => {
        (Array.isArray(item.invoices) ? item.invoices : []).forEach((line) => {
          if (line.invoiceNo === cycle.invoiceNo && line.status !== "Cancelled") {
            totalAmount += line.invoiceAmountINR;
            lineCount++;
          }
        });
      });

      const status = getInvoiceCycleStatus(project, cycle.invoiceNo);
      const isPrintable = status === "Paid" || status === "Raised";

      return {
        ...cycle,
        totalAmount,
        lineCount,
        status,
        isPrintable,
      };
    });
  }, [project]);

  // Printable cycles only
  const printableCycles = useMemo(() => cycles.filter((c) => !c.isNew && c.isPrintable), [cycles]);

  // Selected Invoice Cycle
  const [selectedCycleNo, setSelectedCycleNo] = useState<string>(() => {
    if (initialInvoiceNo && cycles.some((c) => c.invoiceNo === initialInvoiceNo && c.isPrintable)) {
      return initialInvoiceNo;
    }
    return printableCycles[0]?.invoiceNo ?? cycles.find((c) => !c.isNew)?.invoiceNo ?? "";
  });

  const activeCycle = useMemo(() => cycles.find((c) => c.invoiceNo === selectedCycleNo), [cycles, selectedCycleNo]);

  // Form State for commercial document details
  const [details, setDetails] = useState<InvoiceDocumentDetails>(() => {
    return invoiceDocumentService.getSavedDocumentDetails(project, selectedCycleNo);
  });

  // When selected cycle changes, load its saved document details
  useEffect(() => {
    if (!selectedCycleNo) return;
    const loaded = invoiceDocumentService.getSavedDocumentDetails(project, selectedCycleNo);
    setTimeout(() => setDetails(loaded), 0);
  }, [selectedCycleNo, project]);

  // Preview Mode Toggle
  const [showPreview, setShowPreview] = useState(false);

  // Direct element reference to the rendered Invoice Preview component
  const documentRef = useRef<HTMLDivElement>(null);

  // Helper for buyer state updates
  const buyer: BuyerInformation = details.buyerInformation || {
    companyName: "",
    billingAddress: "",
    gstin: "",
    stateName: "",
    stateCode: "",
    placeOfSupply: "",
    contactPerson: "",
    contactNumber: "",
    email: "",
  };

  const updateBuyer = (field: keyof BuyerInformation, val: string) => {
    setDetails({
      ...details,
      buyerInformation: {
        ...buyer,
        [field]: val,
      },
    });
  };

  // DTO for rendered document
  // Two fully independent PDF/print mappers — which one runs is decided
  // purely by the project's Invoice Method, never mixed. Lump Sum invoice
  // lines always have quantityBilled === 0 by design, so routing them
  // through the Quantity mapper's qty-based line filter is exactly what
  // previously produced a ₹0 document.
  const documentDTO = useMemo(() => {
    if (!selectedCycleNo) return null;
    const method = getInvoiceMethod(project);
    if (method === "lump_sum") return mapProjectToLumpSumInvoiceDocumentDTO(project, selectedCycleNo, details);
    if (method === "mlmp") return mapProjectToMlmpInvoiceDocumentDTO(project, selectedCycleNo, details);
    if (method === "amount_based") return mapProjectToAmountBasedInvoiceDocumentDTO(project, selectedCycleNo, details);
    return mapProjectToInvoiceDocumentDTO(project, selectedCycleNo, details);
  }, [project, selectedCycleNo, details]);

  // Save changes onto project
  const handleSaveDetails = () => {
    if (!selectedCycleNo) return project;
    const updated = invoiceDocumentService.saveDocumentDetails(project, selectedCycleNo, details);
    if (setProject) {
      setProject(updated);
    }
    return updated;
  };

  // Component-based print targeting ONLY the Invoice Preview component
  const handlePrint = () => {
    handleSaveDetails();
    if (documentRef.current) {
      const targetElement = (documentRef.current.querySelector(".invoice-document-root") as HTMLElement) || documentRef.current;
      printComponentElement(targetElement, `${documentDTO?.invoiceNoCustom || "Invoice"}_Tax_Invoice`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 nu-fade-in">
      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Offscreen / Live Rendered Target of the single source of truth Invoice Preview component */}
        {documentDTO && (
          <div className="hidden" aria-hidden="true">
            <div ref={documentRef}>
              <InvoiceDocumentView document={documentDTO} />
            </div>
          </div>
        )}

        {/* Modal Header */}
        <div className="no-print px-6 py-4 border-b border-[var(--nu-border)] bg-white dark:bg-slate-900 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50">
              <Printer size={20} />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-[var(--nu-text)] tracking-tight">
                {showPreview ? "Invoice Document Preview" : "Generate Invoice Document"}
              </h3>
              <p className="text-xs text-[var(--nu-text-muted)]">
                {showPreview
                  ? "Official Customer Tax Invoice Document (HPCL Sample Format)"
                  : "Select an invoice cycle and customize commercial & buyer (Bill To) references."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {showPreview && (
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--nu-border)] bg-[var(--nu-surface)] text-xs font-bold text-[var(--nu-text)] hover:bg-[var(--nu-surface-alt)] transition cursor-pointer"
              >
                <ArrowLeft size={14} />
                <span>Back to Form</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-[var(--nu-text-muted)] hover:bg-[var(--nu-surface-alt)] hover:text-[var(--nu-text)] transition cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 nu-scrollbar bg-slate-50/50 dark:bg-slate-900/40">
          {showPreview && documentDTO ? (
            <InvoiceDocumentView document={documentDTO} />
          ) : (
            <>
              {/* SECTION 1: INVOICE CYCLE SELECTION */}
              <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-[var(--nu-border)] pb-2.5">
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-[var(--nu-accent)]" />
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
                      1. Select Invoice Cycle to Print
                    </h4>
                  </div>
                  <span className="text-[11px] font-semibold text-[var(--nu-text-muted)]">
                    Only Paid or Raised / Submitted invoices can be printed
                  </span>
                </div>

                {cycles.filter((c) => !c.isNew).length === 0 ? (
                  <p className="text-xs text-[var(--nu-text-muted)] italic p-3 text-center">
                    No raised or paid invoices exist for this project yet. Raise an invoice first.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {cycles
                      .filter((c) => !c.isNew)
                      .map((cycle) => {
                        const isSelected = selectedCycleNo === cycle.invoiceNo;
                        const isDisabled = !cycle.isPrintable;

                        return (
                          <div
                            key={cycle.invoiceNo}
                            onClick={() => {
                              if (!isDisabled) setSelectedCycleNo(cycle.invoiceNo);
                            }}
                            className={`p-3.5 rounded-xl border transition-all flex items-start justify-between cursor-pointer ${
                              isDisabled
                                ? "opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800"
                                : isSelected
                                ? "bg-[var(--nu-accent-soft)] border-[var(--nu-accent)] ring-2 ring-[var(--nu-accent)]/20 shadow-xs"
                                : "bg-[var(--nu-surface)] border-[var(--nu-border)] hover:bg-[var(--nu-surface-alt)]"
                            }`}
                          >
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  name="invoiceCycleRadio"
                                  checked={isSelected}
                                  disabled={isDisabled}
                                  onChange={() => setSelectedCycleNo(cycle.invoiceNo)}
                                  className="accent-[var(--nu-accent)] cursor-pointer"
                                />
                                <span className="text-xs font-extrabold text-[var(--nu-text)] truncate">
                                  {cycle.label} ({cycle.invoiceNo})
                                </span>
                              </div>
                              <p className="text-[11px] text-[var(--nu-text-muted)] pl-5">
                                {cycle.lineCount} billed activity {cycle.lineCount === 1 ? "line" : "lines"}
                              </p>
                              <p className="text-xs font-bold text-[var(--nu-accent)] pl-5 font-mono">
                                ₹ {formatBusinessINR(cycle.totalAmount)}
                              </p>
                            </div>

                            <div className="shrink-0">
                              <Badge tone={INVOICE_LINE_STATUS_TONE[cycle.status]} dot className="text-[10px]">
                                {INVOICE_LINE_STATUS_LABEL[cycle.status]}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* SECTION 2: BUYER (BILL TO) DETAILS CARD */}
              <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-xl p-4 space-y-4">
                <div className="border-b border-[var(--nu-border)] pb-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 size={16} className="text-blue-500" />
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
                      2. Buyer (Bill To) Information
                    </h4>
                  </div>
                  <span className="text-[11px] font-semibold text-[var(--nu-text-muted)]">
                    Saved independently per invoice cycle
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  {/* Company Name */}
                  <div className="lg:col-span-2">
                    <label className="font-bold text-[var(--nu-text)] block mb-1">Company Name</label>
                    <input
                      type="text"
                      value={buyer.companyName}
                      onChange={(e) => updateBuyer("companyName", e.target.value)}
                      placeholder="Enter customer / buyer company name"
                      className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-lg p-2.5 text-[var(--nu-text)] font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
                    />
                  </div>

                  {/* GSTIN / UIN */}
                  <div>
                    <label className="font-bold text-[var(--nu-text)] block mb-1">GSTIN / UIN</label>
                    <input
                      type="text"
                      value={buyer.gstin}
                      onChange={(e) => updateBuyer("gstin", e.target.value)}
                      placeholder="e.g. 29AAACH1118B1Z8"
                      className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-lg p-2.5 text-[var(--nu-text)] font-mono uppercase focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
                    />
                  </div>

                  {/* Billing Address Multi-line Textarea */}
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="font-bold text-[var(--nu-text)] block mb-1">Billing Address</label>
                    <textarea
                      rows={2}
                      value={buyer.billingAddress}
                      onChange={(e) => updateBuyer("billingAddress", e.target.value)}
                      placeholder="Enter full billing address, street, city, pin code..."
                      className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-lg p-2.5 text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
                    />
                  </div>

                  {/* State Name */}
                  <div>
                    <label className="font-bold text-[var(--nu-text)] block mb-1">State Name</label>
                    <input
                      type="text"
                      value={buyer.stateName}
                      onChange={(e) => updateBuyer("stateName", e.target.value)}
                      placeholder="e.g. Karnataka"
                      className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-lg p-2.5 text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
                    />
                  </div>

                  {/* State Code */}
                  <div>
                    <label className="font-bold text-[var(--nu-text)] block mb-1">State Code</label>
                    <input
                      type="text"
                      value={buyer.stateCode}
                      onChange={(e) => updateBuyer("stateCode", e.target.value)}
                      placeholder="e.g. 29"
                      className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-lg p-2.5 text-[var(--nu-text)] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
                    />
                  </div>

                  {/* Place of Supply */}
                  <div>
                    <label className="font-bold text-[var(--nu-text)] block mb-1">Place of Supply</label>
                    <input
                      type="text"
                      value={buyer.placeOfSupply}
                      onChange={(e) => updateBuyer("placeOfSupply", e.target.value)}
                      placeholder="e.g. Karnataka"
                      className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-lg p-2.5 text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
                    />
                  </div>

                  {/* Contact Person */}
                  <div>
                    <label className="font-bold text-[var(--nu-text)] block mb-1">Contact Person</label>
                    <input
                      type="text"
                      value={buyer.contactPerson}
                      onChange={(e) => updateBuyer("contactPerson", e.target.value)}
                      placeholder="e.g. Mr. N. Jose"
                      className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-lg p-2.5 text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
                    />
                  </div>

                  {/* Contact Number */}
                  <div>
                    <label className="font-bold text-[var(--nu-text)] block mb-1">Contact Number</label>
                    <input
                      type="text"
                      value={buyer.contactNumber}
                      onChange={(e) => updateBuyer("contactNumber", e.target.value)}
                      placeholder="e.g. +91 99879 03206"
                      className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-lg p-2.5 text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
                    />
                  </div>

                  {/* E-Mail */}
                  <div>
                    <label className="font-bold text-[var(--nu-text)] block mb-1">E-Mail</label>
                    <input
                      type="email"
                      value={buyer.email}
                      onChange={(e) => updateBuyer("email", e.target.value)}
                      placeholder="e.g. jose.n@hpcl.in"
                      className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-lg p-2.5 text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 3: COMMERCIAL DOCUMENT REFERENCES */}
              <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-xl p-4 space-y-4">
                <div className="border-b border-[var(--nu-border)] pb-2.5">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
                    3. Commercial Document & Reference Details
                  </h4>
                  <p className="text-[11px] text-[var(--nu-text-muted)] mt-0.5">
                    Values entered here belong strictly to the printable document and will be saved with this invoice cycle.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  {/* Invoice No Custom */}
                  <div>
                    <label className="font-bold text-[var(--nu-text)] block mb-1">Invoice No.</label>
                    <input
                      type="text"
                      value={details.invoiceNoCustom || ""}
                      onChange={(e) => setDetails({ ...details, invoiceNoCustom: e.target.value })}
                      placeholder="e.g. 90/26-27"
                      className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-lg p-2.5 text-[var(--nu-text)] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
                    />
                  </div>

                  {/* Reference No & Date */}
                  <div>
                    <label className="font-bold text-[var(--nu-text)] block mb-1">Reference No. & Date</label>
                    <input
                      type="text"
                      value={details.referenceNoAndDate || ""}
                      onChange={(e) => setDetails({ ...details, referenceNoAndDate: e.target.value })}
                      placeholder="e.g. 90/26-27 dt. 03-Aug-26"
                      className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-lg p-2.5 text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
                    />
                  </div>

                  {/* Buyer's Order No */}
                  <div>
                    <label className="font-bold text-[var(--nu-text)] block mb-1">Buyer's Order No.</label>
                    <input
                      type="text"
                      value={details.buyersOrderNo || ""}
                      onChange={(e) => setDetails({ ...details, buyersOrderNo: e.target.value })}
                      placeholder="e.g. 5400352468"
                      className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-lg p-2.5 text-[var(--nu-text)] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
                    />
                  </div>

                  {/* Dated */}
                  <div>
                    <label className="font-bold text-[var(--nu-text)] block mb-1">Order Dated</label>
                    <input
                      type="text"
                      value={details.buyersOrderDate || ""}
                      onChange={(e) => setDetails({ ...details, buyersOrderDate: e.target.value })}
                      placeholder="e.g. 03-Aug-26"
                      className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-lg p-2.5 text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
                    />
                  </div>

                  {/* Payment Terms */}
                  <div>
                    <label className="font-bold text-[var(--nu-text)] block mb-1">Mode / Terms of Payment</label>
                    <input
                      type="text"
                      value={details.paymentTerms || ""}
                      onChange={(e) => setDetails({ ...details, paymentTerms: e.target.value })}
                      placeholder="e.g. 30 Days"
                      className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-lg p-2.5 text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
                    />
                  </div>

                  {/* Other References */}
                  <div>
                    <label className="font-bold text-[var(--nu-text)] block mb-1">Other References</label>
                    <input
                      type="text"
                      value={details.otherReferences || ""}
                      onChange={(e) => setDetails({ ...details, otherReferences: e.target.value })}
                      placeholder="e.g. Internal PR No : 11040_3"
                      className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-lg p-2.5 text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
                    />
                  </div>

                  {/* Reference Date */}
                  <div>
                    <label className="font-bold text-[var(--nu-text)] block mb-1">Reference Date</label>
                    <input
                      type="text"
                      value={details.referenceDate || ""}
                      onChange={(e) => setDetails({ ...details, referenceDate: e.target.value })}
                      placeholder="e.g. 16-Jan-26"
                      className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-lg p-2.5 text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
                    />
                  </div>

                  {/* Terms of Delivery */}
                  <div className="sm:col-span-2">
                    <label className="font-bold text-[var(--nu-text)] block mb-1">Terms of Delivery</label>
                    <input
                      type="text"
                      value={details.termsOfDelivery || ""}
                      onChange={(e) => setDetails({ ...details, termsOfDelivery: e.target.value })}
                      placeholder="e.g. Free Delivery to Site / HP Green R&D Centre"
                      className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-lg p-2.5 text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 4: COMPANY PRINT SETTINGS */}
              <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-xl p-4 space-y-4">
                <div className="border-b border-[var(--nu-border)] pb-2.5">
                  <div className="flex items-center gap-2">
                    <Landmark size={16} className="text-blue-500" />
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
                      4. Company Print Settings
                    </h4>
                  </div>
                  <p className="text-[11px] text-[var(--nu-text-muted)] mt-0.5">
                    The footer details (PAN, bank account, signature lines) printed on this invoice. Saved
                    independently per invoice cycle — editing one invoice never changes another already-issued one.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  {/* Company PAN */}
                  <div>
                    <label className="font-bold text-[var(--nu-text)] block mb-1">Company PAN</label>
                    <input
                      type="text"
                      value={details.companyPan || ""}
                      onChange={(e) => setDetails({ ...details, companyPan: e.target.value })}
                      placeholder="e.g. AAFFI1423E"
                      className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-lg p-2.5 text-[var(--nu-text)] font-mono uppercase focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
                    />
                  </div>

                  {/* Bank Name */}
                  <div>
                    <label className="font-bold text-[var(--nu-text)] block mb-1">Bank Name</label>
                    <input
                      type="text"
                      value={details.bankName || ""}
                      onChange={(e) => setDetails({ ...details, bankName: e.target.value })}
                      placeholder="e.g. Union Bank of India"
                      className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-lg p-2.5 text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
                    />
                  </div>

                  {/* Account Number */}
                  <div>
                    <label className="font-bold text-[var(--nu-text)] block mb-1">Account Number</label>
                    <input
                      type="text"
                      value={details.accountNo || ""}
                      onChange={(e) => setDetails({ ...details, accountNo: e.target.value })}
                      placeholder="e.g. 530601010038789"
                      className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-lg p-2.5 text-[var(--nu-text)] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
                    />
                  </div>

                  {/* Branch */}
                  <div>
                    <label className="font-bold text-[var(--nu-text)] block mb-1">Branch</label>
                    <input
                      type="text"
                      value={details.branch || ""}
                      onChange={(e) => setDetails({ ...details, branch: e.target.value })}
                      placeholder="e.g. Anna Nagar"
                      className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-lg p-2.5 text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
                    />
                  </div>

                  {/* IFSC Code */}
                  <div>
                    <label className="font-bold text-[var(--nu-text)] block mb-1">IFSC Code</label>
                    <input
                      type="text"
                      value={details.ifscCode || ""}
                      onChange={(e) => setDetails({ ...details, ifscCode: e.target.value })}
                      placeholder="e.g. UBIN0553069"
                      className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-lg p-2.5 text-[var(--nu-text)] font-mono uppercase focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
                    />
                  </div>

                  {/* Company Signature Text */}
                  <div>
                    <label className="font-bold text-[var(--nu-text)] block mb-1">Company Signature Text</label>
                    <input
                      type="text"
                      value={details.companySignatureText || ""}
                      onChange={(e) => setDetails({ ...details, companySignatureText: e.target.value })}
                      placeholder="e.g. for iFluids Engineering"
                      className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-lg p-2.5 text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
                    />
                  </div>

                  {/* Authorised Signatory Text */}
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="font-bold text-[var(--nu-text)] block mb-1">Authorised Signatory Text</label>
                    <input
                      type="text"
                      value={details.authorisedSignatoryText || ""}
                      onChange={(e) => setDetails({ ...details, authorisedSignatoryText: e.target.value })}
                      placeholder="e.g. AUTHORISED SIGNATORY"
                      className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-lg p-2.5 text-[var(--nu-text)] uppercase focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="no-print px-6 py-4 border-t border-[var(--nu-border)] bg-white dark:bg-slate-900 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-[var(--nu-border)] bg-[var(--nu-surface)] text-xs font-bold text-[var(--nu-text)] hover:bg-[var(--nu-surface-alt)] transition cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            {!showPreview && (
              <button
                type="button"
                disabled={!activeCycle || !activeCycle.isPrintable}
                onClick={() => {
                  handleSaveDetails();
                  setShowPreview(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 transition cursor-pointer"
              >
                <Eye size={14} className="text-blue-500" />
                <span>Preview Document</span>
              </button>
            )}

            {/* Download PDF option removed per user request */}

            <button
              type="button"
              disabled={!activeCycle || !activeCycle.isPrintable}
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-4.5 py-2 rounded-xl bg-[var(--nu-accent)] hover:opacity-90 text-white text-xs font-bold shadow-md transition cursor-pointer disabled:opacity-40"
            >
              <Printer size={14} />
              <span>Print Invoice</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
