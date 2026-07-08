import { useState } from "react";
import { Paperclip, X } from "lucide-react";

import type { InvoiceEntry } from "../../../../types/InvoiceItem";

interface Props {
  invoice?: InvoiceEntry | null;
  onClose: () => void;
  onSave: (invoice: InvoiceEntry) => void;
}

const CURRENCY_OPTIONS = ["INR", "USD", "EUR", "AED", "MYR", "QAR", "OMR"];

const RaiseInvoiceModal = ({ invoice, onClose, onSave }: Props) => {
  const isEditMode = Boolean(invoice);

  const [invoiceNumber, setInvoiceNumber] = useState(
    invoice?.invoiceNumber ?? ""
  );

  const [invoiceDate, setInvoiceDate] = useState(
    invoice?.invoiceDate ?? ""
  );

  const [invoiceAmount, setInvoiceAmount] = useState<number | "">(
    invoice?.invoiceAmount ?? ""
  );

  const [invoiceReference, setInvoiceReference] = useState(
    invoice?.invoiceReference ?? ""
  );

  const [remarks, setRemarks] = useState(invoice?.remarks ?? "");

  const [currency, setCurrency] = useState(invoice?.currency ?? "INR");

  const [exchangeRate, setExchangeRate] = useState<number | "">(
    invoice?.exchangeRate ?? 1
  );

  const [attachmentName, setAttachmentName] = useState(
    invoice?.attachmentName ?? ""
  );

  const [error, setError] = useState("");

  const isInr = currency === "INR";

  const handleCurrencyChange = (value: string) => {
    setCurrency(value);

    if (value === "INR") {
      setExchangeRate(1);
    }
  };

  const handleSave = () => {
    if (!invoiceNumber.trim()) {
      setError("Invoice number is required.");
      return;
    }

    if (!invoiceDate) {
      setError("Invoice date is required.");
      return;
    }

    if (invoiceAmount === "" || invoiceAmount <= 0) {
      setError("Invoice amount must be greater than 0.");
      return;
    }

    const rate = isInr ? 1 : exchangeRate === "" ? 0 : exchangeRate;

    if (!isInr && rate <= 0) {
      setError("Exchange rate must be greater than 0.");
      return;
    }

    const invoiceAmountINR = isInr ? invoiceAmount : invoiceAmount * rate;

    onSave({
      id: invoice?.id ?? crypto.randomUUID(),
      invoiceNumber: invoiceNumber.trim(),
      invoiceDate,
      invoiceAmount,
      invoiceAmountINR,
      invoiceReference: invoiceReference.trim(),
      remarks: remarks.trim(),
      currency,
      exchangeRate: rate,
      attachmentName,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50 p-5">

      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl">

        {/* Header */}

        <div className="flex justify-between items-center border-b px-6 py-5">

          <div>

            <h2 className="text-2xl font-bold">
              {isEditMode ? "Edit Invoice" : "Raise Invoice"}
            </h2>

            <p className="text-sm text-gray-500 mt-1">
              Record an invoice raised against this work package.
            </p>

          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <X size={20} />
          </button>

        </div>

        {/* Body */}

        <div className="p-6">

          <div className="grid grid-cols-2 gap-5">

            {/* Invoice Number */}

            <div>
              <label className="text-sm font-medium">
                Invoice Number
              </label>

              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="Enter Invoice Number"
                className="w-full border rounded-xl mt-2 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Invoice Date */}

            <div>
              <label className="text-sm font-medium">
                Invoice Date
              </label>

              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full border rounded-xl mt-2 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Currency */}

            <div>
              <label className="text-sm font-medium">
                Currency
              </label>

              <select
                value={currency}
                onChange={(e) => handleCurrencyChange(e.target.value)}
                className="w-full border rounded-xl mt-2 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {CURRENCY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            {/* Exchange Rate */}

            <div>
              <label className="text-sm font-medium">
                Exchange Rate
              </label>

              <input
                type="number"
                min={0}
                disabled={isInr}
                value={exchangeRate}
                onChange={(e) => {
                  const raw = e.target.value;
                  setExchangeRate(raw === "" ? "" : Number(raw));
                }}
                className={`w-full border rounded-xl mt-2 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isInr ? "bg-gray-100 text-gray-400 cursor-not-allowed" : ""
                }`}
              />
            </div>

            {/* Invoice Amount */}

            <div>
              <label className="text-sm font-medium">
                Invoice Amount
              </label>

              <input
                type="number"
                min={0}
                value={invoiceAmount}
                onChange={(e) => {
                  const raw = e.target.value;
                  setInvoiceAmount(raw === "" ? "" : Number(raw));
                }}
                className="w-full border rounded-xl mt-2 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Invoice Reference */}

            <div>
              <label className="text-sm font-medium">
                Invoice Reference
              </label>

              <input
                type="text"
                value={invoiceReference}
                onChange={(e) => setInvoiceReference(e.target.value)}
                placeholder="Client PO / reference no."
                className="w-full border rounded-xl mt-2 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Attachment */}

            <div className="col-span-2">
              <label className="text-sm font-medium">
                Attachment
              </label>

              <label className="mt-2 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-gray-300 p-3 text-sm text-gray-500 hover:bg-gray-50">
                <Paperclip size={16} className="shrink-0 text-gray-400" />

                {attachmentName || "Choose a file to attach"}

                <input
                  type="file"
                  className="hidden"
                  onChange={(e) =>
                    setAttachmentName(e.target.files?.[0]?.name ?? "")
                  }
                />
              </label>

              <p className="mt-1 text-xs text-gray-400">
                Placeholder only — document storage will be wired to the
                backend later.
              </p>
            </div>

            {/* Remarks */}

            <div className="col-span-2">
              <label className="text-sm font-medium">
                Remarks
              </label>

              <textarea
                rows={3}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="w-full border rounded-xl mt-2 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {error && (
              <div className="col-span-2 text-red-600 text-sm font-medium">
                {error}
              </div>
            )}

          </div>

        </div>

        {/* Footer */}

        <div className="flex justify-end gap-3 border-t px-6 py-5">

          <button
            onClick={onClose}
            className="border rounded-xl px-5 py-2.5 hover:bg-gray-100"
          >
            Cancel
          </button>

          <button
            onClick={handleSave}
            className="bg-blue-600 text-white rounded-xl px-5 py-2.5 hover:bg-blue-700"
          >
            {isEditMode ? "Update Invoice" : "Save Invoice"}
          </button>

        </div>

      </div>

    </div>
  );
};

export default RaiseInvoiceModal;
