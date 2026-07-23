import {
  FileText,
  IndianRupee,
  Landmark,
  Wallet,
} from "lucide-react";

import { getInvoices } from "../../../services/invoiceService";
import { formatBusinessINR, formatFullINR } from "../../../utils/formatCurrency";

const InvoiceKPIs = () => {
  const invoices = getInvoices();

  const totalInvoices = invoices.length;

  const totalInvoiceRaised = invoices.reduce(
    (sum, invoice) => sum + invoice.invoiceAmount,
    0
  );

  const totalPaymentReceived = invoices.reduce(
    (sum, invoice) => sum + invoice.receivedAmount,
    0
  );

  const totalOutstanding = invoices.reduce(
    (sum, invoice) => sum + invoice.outstandingAmount,
    0
  );

  const cards = [
    {
      title: "Total Invoices",
      value: String(totalInvoices),
      tooltip: String(totalInvoices),
      icon: FileText,
      bg: "bg-blue-100 dark:bg-blue-950/40",
      iconColor: "text-blue-600 dark:text-blue-400",
    },
    {
      title: "Invoice Raised",
      value: formatBusinessINR(totalInvoiceRaised),
      tooltip: formatFullINR(totalInvoiceRaised),
      icon: IndianRupee,
      bg: "bg-green-100 dark:bg-green-950/40",
      iconColor: "text-green-600 dark:text-green-400",
    },
    {
      title: "Payment Received",
      value: formatBusinessINR(totalPaymentReceived),
      tooltip: formatFullINR(totalPaymentReceived),
      icon: Landmark,
      bg: "bg-purple-100 dark:bg-purple-950/40",
      iconColor: "text-purple-600 dark:text-purple-400",
    },
    {
      title: "Outstanding",
      value: formatBusinessINR(totalOutstanding),
      tooltip: formatFullINR(totalOutstanding),
      icon: Wallet,
      bg: "bg-orange-100 dark:bg-orange-950/40",
      iconColor: "text-orange-600 dark:text-orange-400",
    },
  ];

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-6">

      {cards.map((card) => {
        const Icon = card.icon;

        return (
          <div
            key={card.title}
            title={card.tooltip}
            className="
              bg-white dark:bg-slate-900
              rounded-2xl
              border
              border-gray-100 dark:border-slate-800
              shadow-md
              p-5
              transition-all
              hover:-translate-y-1
              hover:shadow-lg
            "
          >
            <div className="flex items-center justify-between">

              <div>

                <p className="text-sm text-gray-500 dark:text-slate-400">
                  {card.title}
                </p>

                <h2 className="mt-2 text-2xl font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                  {card.value}
                </h2>

              </div>

              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center ${card.bg}`}
              >
                <Icon
                  size={28}
                  className={card.iconColor}
                />
              </div>

            </div>

          </div>
        );
      })}

    </div>
  );
};

export default InvoiceKPIs;