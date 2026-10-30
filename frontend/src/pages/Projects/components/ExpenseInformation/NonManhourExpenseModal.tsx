import { useState, useEffect } from "react";
import { X } from "lucide-react";

import type { NonManhourExpense } from "../../../../types/NonManhourExpense";
import { EXPENSE_CATEGORIES, isKnownExpenseCategory } from "../../../../types/expenseCategories";
import Portal from "../../../../components/ui/Portal";

interface Props {
  expense?: NonManhourExpense | null;
  onClose: () => void;
  onSave: (expense: NonManhourExpense) => void;
}

const NonManhourExpenseModal = ({ expense, onClose, onSave }: Props) => {
  useEffect(() => {
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, []);

  const isEditMode = Boolean(expense);

  const [category, setCategory] = useState(expense?.category ?? "");

  const [description, setDescription] = useState(expense?.description ?? "");

  const [quantity, setQuantity] = useState<number | "">(
    expense?.quantity ?? ""
  );

  const [unitCost, setUnitCost] = useState<number | "">(
    expense?.unitCost ?? ""
  );

  const [remarks, setRemarks] = useState(expense?.remarks ?? "");

  const [error, setError] = useState("");

  const totalCost =
    quantity === "" || unitCost === "" ? 0 : quantity * unitCost;

  const handleSave = () => {
    if (!category) {
      setError("Expense category is required.");
      return;
    }

    if (!description.trim()) {
      setError("Description is required.");
      return;
    }

    if (quantity === "" || quantity <= 0) {
      setError("Quantity must be greater than 0.");
      return;
    }

    if (unitCost === "" || unitCost <= 0) {
      setError("Unit cost must be greater than 0.");
      return;
    }

    onSave({
      id: expense?.id ?? crypto.randomUUID(),
      category,
      description: description.trim(),
      quantity,
      unitCost,
      totalCost: quantity * unitCost,
      remarks: remarks.trim(),
    });
  };

  // Rendered through a Portal into document.body, like the app's other overlays. Inline, the "fixed" overlay is NOT viewport-anchored:
  // MainLayout's wrapper (.animate-pmo-fade-up) keeps `filter: blur(0)` after its animation, and any non-`none` filter on an ancestor
  // makes that ancestor the containing block for position: fixed descendants. The overlay then spans the whole page height, the modal
  // is centred in the document instead of the screen (footer below the fold), and the body scroll lock below stops the user reaching it.
  return (
    <Portal>
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex justify-center items-center z-50 p-4">

      <div className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">

        {/* Header */}

        <div className="flex justify-between items-center border-b border-gray-200 dark:border-slate-700 px-6 py-5 shrink-0">

          <div>

            <h2 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-slate-100">
              {isEditMode ? "Edit Project Expense" : "Add Project Expense"}
            </h2>

            <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 mt-1">
              Record non man-hour project expenses.
            </p>

          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X size={20} className="text-slate-600 dark:text-slate-300" />
          </button>

        </div>

        {/* Body */}

        <div className="p-5 sm:p-6 flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar">

          <div className="grid grid-cols-2 gap-5">

            {/* Category */}

            <div>

              <label className="text-sm font-medium">
                Expense Category
              </label>

              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border rounded-xl mt-2 p-3 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >

                <option value="">
                  Select Category
                </option>

                {/* Legacy safe-display (Sept 2026 category refresh) — category
                    is free-text, not an enum, so an existing row saved under
                    an old category (e.g. "Flight Tickets") keeps that exact
                    string in the database. Without this option, the <select>
                    would silently show no selection at all for such a row,
                    and saving it back would blank the category out entirely.
                    Rendering it here, once, keeps the stored value visible
                    and re-selectable until the user deliberately picks one of
                    the current 14 — it is never added back as a normal,
                    always-available choice. */}
                {category && !isKnownExpenseCategory(category) && (
                  <option value={category}>
                    {category} (legacy category)
                  </option>
                )}

                {EXPENSE_CATEGORIES.map((item) => (

                  <option key={item} value={item}>
                    {item}
                  </option>

                ))}

              </select>

            </div>

            {/* Description */}

            <div>

              <label className="text-sm font-medium">
                Description
              </label>

              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter description"
                className="w-full border rounded-xl mt-2 p-3 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />

            </div>

            {/* Quantity */}

            <div>

              <label className="text-sm font-medium">
                Quantity
              </label>

              <input
                type="number"
                min={0}
                value={quantity}
                onChange={(e) => {
                  const raw = e.target.value;
                  setQuantity(raw === "" ? "" : Number(raw));
                }}
                className="w-full border rounded-xl mt-2 p-3 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />

            </div>

            {/* Unit Cost */}

            <div>

              <label className="text-sm font-medium">
                Unit Cost
              </label>

              <input
                type="number"
                min={0}
                value={unitCost}
                onChange={(e) => {
                  const raw = e.target.value;
                  setUnitCost(raw === "" ? "" : Number(raw));
                }}
                className="w-full border rounded-xl mt-2 p-3 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />

            </div>

            {/* Remarks */}

            <div className="col-span-2">

              <label className="text-sm font-medium">
                Remarks
              </label>

              <textarea
                rows={4}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="w-full border rounded-xl mt-2 p-3 focus:outline-none focus:ring-2 focus:ring-orange-500"
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

        <div className="border-t border-gray-200 dark:border-slate-700 px-5 sm:px-6 py-4 flex justify-between items-center shrink-0 sticky bottom-0 z-10 bg-white dark:bg-[#1E293B]">

          <div>

            <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">
              Total Expense
            </p>

            <h2 className="text-2xl sm:text-3xl font-bold text-orange-600 dark:text-orange-400">
              ₹ {totalCost.toLocaleString("en-IN")}
            </h2>

          </div>

          <div className="flex gap-3">

            <button
              onClick={onClose}
              className="border border-gray-300 dark:border-slate-700 rounded-xl px-5 py-2.5 hover:bg-gray-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer font-medium"
            >
              Cancel
            </button>

            <button
              onClick={handleSave}
              className="bg-orange-600 text-white rounded-xl px-5 py-2.5 hover:bg-orange-700 font-bold cursor-pointer"
            >
              {isEditMode ? "Update Expense" : "Save Expense"}
            </button>

          </div>

        </div>

      </div>

    </div>
    </Portal>
  );
};

export default NonManhourExpenseModal;
