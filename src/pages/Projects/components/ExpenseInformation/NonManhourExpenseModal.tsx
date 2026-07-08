import { useState } from "react";
import { X } from "lucide-react";

import type { NonManhourExpense } from "../../../../types/NonManhourExpense";

interface Props {
  expense?: NonManhourExpense | null;
  onClose: () => void;
  onSave: (expense: NonManhourExpense) => void;
}

const EXPENSE_CATEGORIES = [
  "Flight Tickets",
  "Hotel Accommodation",
  "Travel Allowance",
  "Printing & Stationery",
  "Courier / Shipping",
  "Consultancy Fee",
  "Cab Expenses",
  "Food Expenses",
  "Equipment Rental",
  "Software License",
  "Miscellaneous",
];

const NonManhourExpenseModal = ({ expense, onClose, onSave }: Props) => {
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

  return (
    <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50 p-5">

      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl">

        {/* Header */}

        <div className="flex justify-between items-center border-b px-6 py-5">

          <div>

            <h2 className="text-2xl font-bold">
              {isEditMode ? "Edit Project Expense" : "Add Project Expense"}
            </h2>

            <p className="text-sm text-gray-500 mt-1">
              Record non man-hour project expenses.
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

        <div className="border-t px-6 py-5 flex justify-between items-center">

          <div>

            <p className="text-sm text-gray-500">
              Total Expense
            </p>

            <h2 className="text-3xl font-bold text-orange-600">
              ₹ {totalCost.toLocaleString("en-IN")}
            </h2>

          </div>

          <div className="flex gap-3">

            <button
              onClick={onClose}
              className="border rounded-xl px-5 py-2.5 hover:bg-gray-100"
            >
              Cancel
            </button>

            <button
              onClick={handleSave}
              className="bg-orange-600 text-white rounded-xl px-5 py-2.5 hover:bg-orange-700"
            >
              {isEditMode ? "Update Expense" : "Save Expense"}
            </button>

          </div>

        </div>

      </div>

    </div>
  );
};

export default NonManhourExpenseModal;
