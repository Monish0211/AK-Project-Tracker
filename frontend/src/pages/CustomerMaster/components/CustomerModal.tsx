import { useState, useEffect, useRef } from "react";
import { X, Upload, Loader2 } from "lucide-react";

import {
  addCustomer,
  updateCustomer,
  extractGstDocument,
  uploadCustomerGstDocument,
  validateGstDocumentFile,
} from "../../../services/customerService";
import type { CustomerInput } from "../../../services/customerService";
import type { Customer } from "../../../types/CustomerModel";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { Button } from "../../../components/ui/Button";

interface Props {
  mode: "add" | "edit";
  customer?: Customer;
  onClose: () => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type GstFieldName = "gstNumber" | "gstLegalName" | "gstTradeName" | "gstState";

const AI_SUGGESTED_CAPTION = "AI-suggested — please verify.";

const CustomerModal = ({ mode, customer, onClose }: Props) => {
  useEffect(() => {
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, []);

  const [form, setForm] = useState<CustomerInput>({
    customerId: customer?.customerId || "",
    customerName: customer?.customerName || "",
    companyName: customer?.companyName || "",
    country: customer?.country || "",
    contactPerson: customer?.contactPerson || "",
    email: customer?.email || "",
    phone: customer?.phone || "",
    status: customer?.status || "Active",
    gstNumber: customer?.gstNumber || "",
    gstLegalName: customer?.gstLegalName || "",
    gstTradeName: customer?.gstTradeName || "",
    gstState: customer?.gstState || "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // GST Document Import/Extraction — the selected file is held in memory
  // only until Save is clicked; nothing is uploaded/persisted just by
  // selecting or extracting (see customerService.ts's own comment on this).
  const [gstFile, setGstFile] = useState<File | null>(null);
  const [gstFileError, setGstFileError] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [aiSuggestedFields, setAiSuggestedFields] = useState<Set<GstFieldName>>(new Set());
  const gstFileInputRef = useRef<HTMLInputElement>(null);

  const update = (field: keyof CustomerInput, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const updateGstField = (field: GstFieldName, value: string) => {
    update(field, value);
    // Once the user edits a field themselves, it is no longer purely an
    // unreviewed AI suggestion sitting there — drop its badge.
    setAiSuggestedFields((prev) => {
      if (!prev.has(field)) return prev;
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  };

  const handleGstFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validateGstDocumentFile(file);
    if (validationError) {
      setGstFileError(validationError);
      if (gstFileInputRef.current) gstFileInputRef.current.value = "";
      return;
    }

    setGstFileError("");
    setGstFile(file);
    setExtracting(true);
    try {
      const candidate = await extractGstDocument(file);
      const suggested = new Set<GstFieldName>();

      // Only pre-fills a field that is currently empty — never silently
      // overwrites something the user already typed before uploading.
      setForm((prev) => {
        const next = { ...prev };
        (Object.keys(candidate) as GstFieldName[]).forEach((field) => {
          const extracted = candidate[field];
          if (extracted.value && !prev[field]?.trim()) {
            next[field] = extracted.value;
            suggested.add(field);
          }
        });
        return next;
      });

      setAiSuggestedFields(suggested);
      if (suggested.size === 0) {
        setGstFileError("The document was read, but no GST details could be reliably extracted. You can enter them manually below.");
      }
    } catch {
      // Extraction failure never blocks the form — the user can still enter
      // GST details manually, and the already-selected file is still kept
      // for upload on Save (extraction and storage are independent steps).
      setGstFileError("Couldn't read this document automatically. You can still enter GST details manually.");
    } finally {
      setExtracting(false);
    }
  };

  const handleSave = async () => {
    if (!form.customerName.trim()) {
      setError("Customer Name is required.");
      return;
    }

    if (form.email && !EMAIL_PATTERN.test(form.email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }

    setSaving(true);
    try {
      const result =
        mode === "edit" && customer ? await updateCustomer(customer.id, form) : await addCustomer(form);

      if (!result.success) {
        setError(result.message || "Unable to save customer.");
        return;
      }

      // The GST document is only ever written to storage AFTER the Customer
      // row itself is confirmed saved — never during extraction, never if
      // the user cancels before this point.
      if (gstFile && result.customer) {
        try {
          await uploadCustomerGstDocument(result.customer.id, gstFile);
        } catch {
          setError("Customer saved, but the GST document could not be attached. Please try uploading it again from Edit Customer.");
          return;
        }
      }

      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-[#161d2c] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-gray-100 dark:border-slate-700 p-5 sm:p-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100">
              {mode === "add" ? "Add Customer" : "Edit Customer"}
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 mt-0.5">
              {mode === "add" ? "Create a new customer organization." : "Update customer organization details."}
            </p>
          </div>

          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer">
            <X size={20} className="text-slate-600 dark:text-slate-300" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-5 custom-scrollbar">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">
              Customer Name <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              value={form.customerName}
              onChange={(e) => update("customerName", e.target.value)}
              placeholder="Enter Customer Name"
              className="w-full"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">GST Number</label>
            <Input
              type="text"
              value={form.gstNumber}
              onChange={(e) => updateGstField("gstNumber", e.target.value)}
              placeholder="Enter GST Number"
              className="w-full"
            />
            {aiSuggestedFields.has("gstNumber") && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{AI_SUGGESTED_CAPTION}</p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">GST Registration Document</label>
            <input
              ref={gstFileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              onChange={handleGstFileChange}
              className="hidden"
              id="gst-document-upload"
            />
            <label
              htmlFor="gst-document-upload"
              className="flex items-center gap-2 w-full rounded-lg border border-dashed border-slate-300 dark:border-slate-600 px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800"
            >
              {extracting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Reading document…
                </>
              ) : (
                <>
                  <Upload size={16} />
                  {gstFile ? gstFile.name : "Upload PDF / JPG / PNG"}
                </>
              )}
            </label>
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Optional. Up to 10MB. Extracted details are shown below for your review — nothing is saved until you click Save Customer.</p>
            {gstFileError && <p className="mt-1 text-xs text-red-600">{gstFileError}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">GST Legal Name</label>
            <Input
              type="text"
              value={form.gstLegalName}
              onChange={(e) => updateGstField("gstLegalName", e.target.value)}
              className="w-full"
            />
            {aiSuggestedFields.has("gstLegalName") && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{AI_SUGGESTED_CAPTION}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">GST Trade Name</label>
            <Input
              type="text"
              value={form.gstTradeName}
              onChange={(e) => updateGstField("gstTradeName", e.target.value)}
              className="w-full"
            />
            {aiSuggestedFields.has("gstTradeName") && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{AI_SUGGESTED_CAPTION}</p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">GST State</label>
            <Input
              type="text"
              value={form.gstState}
              onChange={(e) => updateGstField("gstState", e.target.value)}
              className="w-full"
            />
            {aiSuggestedFields.has("gstState") && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{AI_SUGGESTED_CAPTION}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">Customer ID</label>
            <Input
              type="text"
              value={form.customerId}
              onChange={(e) => update("customerId", e.target.value)}
              placeholder="Optional"
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">Company Name</label>
            <Input
              type="text"
              value={form.companyName}
              onChange={(e) => update("companyName", e.target.value)}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">Country</label>
            <Input
              type="text"
              value={form.country}
              onChange={(e) => update("country", e.target.value)}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">Contact Person</label>
            <Input
              type="text"
              value={form.contactPerson}
              onChange={(e) => update("contactPerson", e.target.value)}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">Email</label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">Phone</label>
            <Input
              type="text"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">Status</label>
            <Select
              value={form.status}
              onChange={(e) => update("status", e.target.value as Customer["status"])}
              className="w-full"
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </Select>
          </div>

          {error && (
            <p className="text-red-600 text-sm sm:col-span-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t border-gray-100 dark:border-slate-700 p-4 sm:p-5 bg-white dark:bg-[#161d2c]">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>

          <Button variant="primary" onClick={handleSave} disabled={saving || extracting}>
            {saving ? "Saving..." : mode === "add" ? "Save Customer" : "Update Customer"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CustomerModal;
