import { ClipboardList } from "lucide-react";

import type { InvoiceItem } from "../../../../types/InvoiceItem";

import {
  getBalanceAmount,
  getBalancePercentage,
  getInvoiceCompletionPercentage,
  getTotalInvoiceRaised,
  getTotalWorkPackageValue,
} from "../../../../services/invoiceProgressService";
import { formatIndianCurrency } from "../../../../utils/quantityCalculations";

import InvoiceProgressRow from "./InvoiceProgressRow";

interface Props {
  items: InvoiceItem[];
  readOnly: boolean;
  onRaiseInvoice?: (itemId: string) => void;
  onViewHistory?: (itemId: string) => void;
}

const noop = () => {};

const InvoiceProgressTable = ({
  items,
  readOnly,
  onRaiseInvoice = noop,
  onViewHistory = noop,
}: Props) => {
  const totalWorkPackageValue = getTotalWorkPackageValue(items);
  const totalInvoiceRaised = getTotalInvoiceRaised(items);
  const balanceRemaining = getBalanceAmount(
    totalWorkPackageValue,
    totalInvoiceRaised
  );
  const balancePercentage = getBalancePercentage(
    totalWorkPackageValue,
    totalInvoiceRaised
  );
  const completionPercentage = getInvoiceCompletionPercentage(
    totalWorkPackageValue,
    totalInvoiceRaised
  );

  const columnCount = readOnly ? 10 : 11;

  return (
    <div className="space-y-4">

      <div className="max-h-[30rem] overflow-auto rounded-xl border border-gray-100">
        <table className="w-full min-w-[1280px] table-fixed border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-14 border-b border-slate-200 px-3 py-3 text-center font-semibold">
                S.No
              </th>
              <th className="border-b border-slate-200 px-3 py-3 text-left font-semibold">
                Description
              </th>
              <th className="w-24 border-b border-slate-200 px-3 py-3 text-right font-semibold">
                Qty
              </th>
              <th className="w-28 border-b border-slate-200 px-3 py-3 text-center font-semibold">
                UOM
              </th>
              <th className="w-32 border-b border-slate-200 px-3 py-3 text-right font-semibold">
                Unit Price
              </th>
              <th className="w-36 border-b border-slate-200 px-3 py-3 text-right font-semibold">
                Total Price
              </th>
              <th className="w-36 border-b border-slate-200 px-3 py-3 text-right font-semibold">
                Invoice Raised
              </th>
              <th className="w-24 border-b border-slate-200 px-3 py-3 text-right font-semibold">
                Invoice %
              </th>
              <th className="w-24 border-b border-slate-200 px-3 py-3 text-right font-semibold">
                Balance %
              </th>
              <th className="w-36 border-b border-slate-200 px-3 py-3 text-center font-semibold">
                Status
              </th>
              {!readOnly && (
                <th className="w-32 border-b border-slate-200 px-3 py-3 text-center font-semibold">
                  Action
                </th>
              )}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {items.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="py-14 text-center">
                  <div className="flex flex-col items-center">
                    <div className="h-16 w-16 rounded-full bg-blue-50 flex items-center justify-center">
                      <ClipboardList size={30} className="text-blue-500" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-gray-700">
                      No Work Packages Added
                    </h3>
                    <p className="mt-2 text-sm text-gray-500 max-w-md">
                      {readOnly
                        ? "No invoice line items have been recorded for this project."
                        : "Click \"Add Work Package\" to start tracking invoice progress."}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              items.map((item, index) => (
                <InvoiceProgressRow
                  key={item.id}
                  item={item}
                  index={index}
                  readOnly={readOnly}
                  onRaiseInvoice={onRaiseInvoice}
                  onViewHistory={onViewHistory}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom Summary — Excel-style invoice percentage sheet */}

      <div className="rounded-xl border border-gray-100 bg-slate-50 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Total Invoice Raised
            </p>
            <p className="mt-1 text-lg font-bold text-blue-700">
              {formatIndianCurrency(totalInvoiceRaised)}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Total Project Value
            </p>
            <p className="mt-1 text-lg font-bold text-slate-800">
              {formatIndianCurrency(totalWorkPackageValue)}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Balance Remaining
            </p>
            <p className="mt-1 text-lg font-bold text-orange-700">
              {formatIndianCurrency(balanceRemaining)}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Balance %
            </p>
            <p className="mt-1 text-lg font-bold text-orange-700">
              {balancePercentage.toFixed(2)}%
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Invoice Completion %
            </p>
            <p className="mt-1 text-lg font-bold text-green-700">
              {completionPercentage.toFixed(2)}%
            </p>
          </div>
        </div>
      </div>

    </div>
  );
};

export default InvoiceProgressTable;
