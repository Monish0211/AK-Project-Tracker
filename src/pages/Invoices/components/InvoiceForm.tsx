import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  Building2,
  CalendarDays,
  CircleDollarSign,
  FileText,
  Hash,
  IndianRupee,
  MessageSquare,
  Save,
  Wallet,
  X,
} from "lucide-react";
import type { Invoice } from "../../types/Invoice";
import type { Project } from "../../types/Project";
import { generateInvoiceRef } from "../../services/invoiceService";

interface InvoiceFormProps {
  projects: Project[];
  invoice?: Invoice | null;
  readOnly?: boolean;
  onSubmit: (invoice: Invoice) => void;
  onCancel: () => void;
}

type InvoiceStatus = Invoice["status"];

const STATUS_OPTIONS: InvoiceStatus[] = [
  "Raised",
  "Partially Paid",
  "Paid",
  "Overdue",
  "Cancelled",
];

const STATUS_BADGE_STYLES: Record<InvoiceStatus, string> = {
  Raised: "bg-blue-50 text-blue-700 border-blue-200",
  "Partially Paid": "bg-amber-50 text-amber-700 border-amber-200",
  Paid: "bg-green-50 text-green-700 border-green-200",
  Overdue: "bg-red-50 text-red-700 border-red-200",
  Cancelled: "bg-slate-100 text-slate-600 border-slate-200",
};

const createEmptyInvoice = (): Invoice => ({
  id: "",
  projectId: "",
  prNo: "",
  client: "",
  invoiceRef: "",
  invoiceDate: "",
  dueDate: "",
  invoiceAmount: 0,
  receivedAmount: 0,
  outstandingAmount: 0,
  status: "Raised",
  remarks: "",
  createdAt: "",
  updatedAt: "",
});

interface FormErrors {
  projectId?: string;
  invoiceDate?: string;
  dueDate?: string;
  invoiceAmount?: string;
  receivedAmount?: string;
}

const InvoiceForm = ({
  projects,
  invoice = null,
  readOnly = false,
  onSubmit,
  onCancel,
}: InvoiceFormProps) => {
  const isEditMode = Boolean(invoice?.id);

  const [formData, setFormData] = useState<Invoice>(
    invoice ?? createEmptyInvoice()
  );
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    setFormData(invoice ?? createEmptyInvoice());
    setErrors({});
  }, [invoice]);

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      outstandingAmount:
        (Number(prev.invoiceAmount) || 0) - (Number(prev.receivedAmount) || 0),
    }));
  }, [formData.invoiceAmount, formData.receivedAmount]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === formData.projectId),
    [projects, formData.projectId]
  );

  const handleProjectChange = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);

    if (!project) {
      setFormData((prev) => ({
        ...prev,
        projectId: "",
        prNo: "",
        client: "",
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      projectId: project.id,
      prNo: project.prNo,
      client: project.client,
      invoiceRef: isEditMode
        ? prev.invoiceRef
        : generateInvoiceRef(project.prNo),
    }));
  };

  const handleChange = <K extends keyof Invoice>(field: K, value: Invoice[K]) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const validate = (): FormErrors => {
    const nextErrors: FormErrors = {};

    if (!formData.projectId) {
      nextErrors.projectId = "Please select a project.";
    }

    if (!formData.invoiceDate) {
      nextErrors.invoiceDate = "Invoice date is required.";
    }

    if (!formData.dueDate) {
      nextErrors.dueDate = "Due date is required.";
    }

    if (
      formData.invoiceDate &&
      formData.dueDate &&
      new Date(formData.dueDate) < new Date(formData.invoiceDate)
    ) {
      nextErrors.dueDate = "Due date cannot be before the invoice date.";
    }

    if (!formData.invoiceAmount || formData.invoiceAmount <= 0) {
      nextErrors.invoiceAmount = "Invoice amount must be greater than zero.";
    }

    if (formData.receivedAmount < 0) {
      nextErrors.receivedAmount = "Received amount cannot be negative.";
    }

    if (
      formData.receivedAmount &&
      formData.invoiceAmount &&
      formData.receivedAmount > formData.invoiceAmount
    ) {
      nextErrors.receivedAmount = "Received amount cannot exceed invoice amount.";
    }

    return nextErrors;
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (readOnly) {
      return;
    }

    const validationErrors = validate();

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const now = new Date().toISOString();

    const finalInvoice: Invoice = {
      ...formData,
      id: formData.id || crypto.randomUUID(),
      createdAt: formData.createdAt || now,
      updatedAt: now,
    };

    onSubmit(finalInvoice);
  };

  const heading = readOnly
    ? "View Invoice"
    : isEditMode
    ? "Edit Invoice"
    : "Add Invoice";

  const subheading = readOnly
    ? "Invoice details are read-only."
    : isEditMode
    ? "Update invoice details for this project."
    : "Select a project and fill in the invoice details.";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-gray-100 bg-white p-6 shadow-md"
    >
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
            <FileText size={20} strokeWidth={2.25} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-800">{heading}</h2>
            <p className="text-sm text-slate-500">{subheading}</p>
          </div>
        </div>

        {(isEditMode || readOnly) && (
          <span
            className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-semibold ${
              STATUS_BADGE_STYLES[formData.status]
            }`}
          >
            {formData.status}
          </span>
        )}
      </div>

      {/* Fields */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {/* Project */}
        <div className="sm:col-span-2 lg:col-span-1">
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <Building2 size={15} className="text-blue-600" />
            Project
          </label>
          <select
            value={formData.projectId}
            disabled={readOnly}
            onChange={(e) => handleProjectChange(e.target.value)}
            className={`h-10 w-full rounded-lg border bg-white px-3 text-sm text-slate-800 outline-none transition-all duration-150 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 ${
              errors.projectId
                ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                : "border-gray-200 focus:border-blue-500 focus:ring-blue-500/20"
            }`}
          >
            <option value="">Select a project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.prNo} — {project.projectTitle}
              </option>
            ))}
          </select>
          {errors.projectId && (
            <p className="mt-1 text-xs font-medium text-red-600">
              {errors.projectId}
            </p>
          )}
        </div>

        {/* PR No */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <Hash size={15} className="text-blue-600" />
            PR No
          </label>
          <input
            type="text"
            value={formData.prNo}
            readOnly
            disabled
            className="h-10 w-full rounded-lg border border-gray-200 bg-slate-50 px-3 text-sm text-slate-500 outline-none"
          />
        </div>

        {/* Client */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <Building2 size={15} className="text-blue-600" />
            Client
          </label>
          <input
            type="text"
            value={formData.client}
            readOnly
            disabled
            className="h-10 w-full rounded-lg border border-gray-200 bg-slate-50 px-3 text-sm text-slate-500 outline-none"
          />
        </div>

        {/* Invoice Reference */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <FileText size={15} className="text-blue-600" />
            Invoice Reference
          </label>
          <input
            type="text"
            value={formData.invoiceRef}
            readOnly
            disabled
            className="h-10 w-full rounded-lg border border-gray-200 bg-slate-50 px-3 text-sm text-slate-500 outline-none"
          />
        </div>

        {/* Invoice Date */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <CalendarDays size={15} className="text-blue-600" />
            Invoice Date
          </label>
          <input
            type="date"
            value={formData.invoiceDate}
            disabled={readOnly}
            onChange={(e) => handleChange("invoiceDate", e.target.value)}
            className={`h-10 w-full rounded-lg border bg-white px-3 text-sm text-slate-800 outline-none transition-all duration-150 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 ${
              errors.invoiceDate
                ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                : "border-gray-200 focus:border-blue-500 focus:ring-blue-500/20"
            }`}
          />
          {errors.invoiceDate && (
            <p className="mt-1 text-xs font-medium text-red-600">
              {errors.invoiceDate}
            </p>
          )}
        </div>

        {/* Due Date */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <CalendarDays size={15} className="text-blue-600" />
            Due Date
          </label>
          <input
            type="date"
            value={formData.dueDate}
            disabled={readOnly}
            onChange={(e) => handleChange("dueDate", e.target.value)}
            className={`h-10 w-full rounded-lg border bg-white px-3 text-sm text-slate-800 outline-none transition-all duration-150 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 ${
              errors.dueDate
                ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                : "border-gray-200 focus:border-blue-500 focus:ring-blue-500/20"
            }`}
          />
          {errors.dueDate && (
            <p className="mt-1 text-xs font-medium text-red-600">
              {errors.dueDate}
            </p>
          )}
        </div>

        {/* Invoice Amount */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <IndianRupee size={15} className="text-blue-600" />
            Invoice Amount
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">
              ₹
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={formData.invoiceAmount === 0 ? "" : formData.invoiceAmount}
              disabled={readOnly}
              onChange={(e) =>
                handleChange("invoiceAmount", Number(e.target.value) || 0)
              }
              placeholder="0"
              className={`h-10 w-full rounded-lg border bg-white pl-7 pr-3 text-sm text-slate-800 outline-none transition-all duration-150 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 ${
                errors.invoiceAmount
                  ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                  : "border-gray-200 focus:border-blue-500 focus:ring-blue-500/20"
              }`}
            />
          </div>
          {errors.invoiceAmount && (
            <p className="mt-1 text-xs font-medium text-red-600">
              {errors.invoiceAmount}
            </p>
          )}
        </div>

        {/* Received Amount */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <Wallet size={15} className="text-blue-600" />
            Received Amount
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">
              ₹
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={
                formData.receivedAmount === 0 ? "" : formData.receivedAmount
              }
              disabled={readOnly}
              onChange={(e) =>
                handleChange("receivedAmount", Number(e.target.value) || 0)
              }
              placeholder="0"
              className={`h-10 w-full rounded-lg border bg-white pl-7 pr-3 text-sm text-slate-800 outline-none transition-all duration-150 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 ${
                errors.receivedAmount
                  ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                  : "border-gray-200 focus:border-blue-500 focus:ring-blue-500/20"
              }`}
            />
          </div>
          {errors.receivedAmount && (
            <p className="mt-1 text-xs font-medium text-red-600">
              {errors.receivedAmount}
            </p>
          )}
        </div>

        {/* Outstanding Amount (auto-calculated) */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <CircleDollarSign size={15} className="text-blue-600" />
            Outstanding Amount
          </label>
          <div className="flex h-10 w-full items-center rounded-lg border border-blue-100 bg-blue-50 px-3">
            <span className="text-sm font-bold text-blue-700">
              ₹{formData.outstandingAmount.toLocaleString("en-IN")}
            </span>
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <CircleDollarSign size={15} className="text-blue-600" />
            Status
          </label>
          <select
            value={formData.status}
            disabled={readOnly}
            onChange={(e) =>
              handleChange("status", e.target.value as InvoiceStatus)
            }
            className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-slate-800 outline-none transition-all duration-150 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        {/* Remarks */}
        <div className="sm:col-span-2 lg:col-span-3">
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <MessageSquare size={15} className="text-blue-600" />
            Remarks
          </label>
          <textarea
            value={formData.remarks}
            disabled={readOnly}
            onChange={(e) => handleChange("remarks", e.target.value)}
            rows={3}
            placeholder="Add any additional notes about this invoice..."
            className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-all duration-150 placeholder:text-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
          />
        </div>
      </div>

      {selectedProject && (
        <p className="mt-4 text-xs text-slate-400">
          Work order value for this project:{" "}
          <span className="font-medium text-slate-500">
            ₹{selectedProject.workOrderValueINR.toLocaleString("en-IN")}
          </span>
        </p>
      )}

      {/* Actions */}
      <div className="mt-6 flex flex-col-reverse gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition-all duration-150 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-300"
        >
          <X size={16} />
          {readOnly ? "Close" : "Cancel"}
        </button>

        {!readOnly && (
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-blue-700 hover:shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 active:bg-blue-800"
          >
            <Save size={16} />
            {isEditMode ? "Update Invoice" : "Save Invoice"}
          </button>
        )}
      </div>
    </form>
  );
};

export default InvoiceForm;