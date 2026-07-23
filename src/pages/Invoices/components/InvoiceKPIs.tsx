import {
  FileText,
  IndianRupee,
  Landmark,
  Wallet,
} from "lucide-react";

import { getInvoices } from "../../../services/invoiceService";

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
      value: totalInvoices,
      icon: FileText,
      bg: "bg-blue-100",
      iconColor: "text-blue-600",
    },
    {
      title: "Invoice Raised",
      value: `₹ ${totalInvoiceRaised.toLocaleString("en-IN")}`,
      icon: IndianRupee,
      bg: "bg-green-100",
      iconColor: "text-green-600",
    },
    {
      title: "Payment Received",
      value: `₹ ${totalPaymentReceived.toLocaleString("en-IN")}`,
      icon: Landmark,
      bg: "bg-purple-100",
      iconColor: "text-purple-600",
    },
    {
      title: "Outstanding",
      value: `₹ ${totalOutstanding.toLocaleString("en-IN")}`,
      icon: Wallet,
      bg: "bg-orange-100",
      iconColor: "text-orange-600",
    },
  ];

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-6">

      {cards.map((card) => {
        const Icon = card.icon;

        return (
          <div
            key={card.title}
            className="
              bg-white
              rounded-2xl
              border
              border-gray-100
              shadow-md
              p-5
              transition-all
              hover:-translate-y-1
              hover:shadow-lg
            "
          >
            <div className="flex items-center justify-between">

              <div>

                <p className="text-sm text-gray-500">
                  {card.title}
                </p>

                <h2 className="mt-2 text-2xl font-bold text-slate-800">
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