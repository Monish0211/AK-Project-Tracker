import { useState } from "react";
import type { Project } from "../../types/Project";

import GeneralInfoCard from "./components/GeneralInfoCard";
import CommercialCard from "./components/CommercialCard";
import InvoiceCard from "./components/InvoiceCard";
import ExpenseCard from "./components/ExpenseCard";
import QuantityCard from "./components/QuantityCard";
import DocumentCard from "./components/DocumentCard";
import FormButtons from "./components/FormButtons";

const AddProject = () => {
  const [project, setProject] = useState<Project>({
    id: crypto.randomUUID(),

    // General Information
    poMonth: "",
    prNo: "",
    client: "",
    department: "",
    domesticForeign: "",
    projectTitle: "",
    workOrderStatus: "",
    projectStartDate: "",
    projectEndDate: "",
    projectStatus: "",

    // Commercial
    contractFormalities: "",
    paymentTerms: "",
    workOrderValue: 0,
    currency: "",
    contractExchangeRate: 0,
    currentExchangeRate: 0,
    workOrderValueINR: 0,

    // Invoice
    invoiceRaised: 0,
    invoiceRaisedINR: 0,
    balanceToBeRaised: 0,
    balanceToBeRaisedINR: 0,
    paymentReceived: 0,
    paymentReceivedINR: 0,
    outstanding: 0,
    outstandingINR: 0,
    paymentStatus: "",

    // Documents
    reportLink: "",
    completionCertificate: "",
    projectCompletionDate: "",

    // Expenses
    manhourExpenses: 0,
    nonManhourExpenses: 0,
    totalExpenses: 0,
    profit: 0,
    profitPercentage: 0,

    // Quantity
    totalWOQty: 0,
    totalInvoiceQty: 0,
    totalPendingQty: 0,
    pendingAmount: 0,
    pendingInvoicePercentage: 0,
  });

  return (
    <div className="space-y-8">

      {/* Page Title */}
      <div>
        <h1 className="text-4xl font-bold">
          Add New Project
        </h1>

        <p className="text-gray-500 mt-2">
          Enter complete project information
        </p>
      </div>

      {/* General Information */}
      <GeneralInfoCard
        project={project}
        setProject={setProject}
      />

      {/* Commercial Information */}
      <CommercialCard
        project={project}
        setProject={setProject}
      />

      {/* Invoice Information */}
      <InvoiceCard />

      {/* Expense Information */}
      <ExpenseCard />

      {/* Quantity Details */}
      <QuantityCard />

      {/* Documents */}
      <DocumentCard />

      {/* Buttons */}
      <FormButtons />

    </div>
  );
};

export default AddProject;