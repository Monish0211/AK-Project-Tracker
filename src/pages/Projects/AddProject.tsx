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

    // ==========================
    // GENERAL INFORMATION
    // ==========================

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

    // ==========================
    // COMMERCIAL INFORMATION
    // ==========================

    contractFormalities: "",
    paymentTerms: "",

    workOrderValue: 0,

    currency: "",

    contractExchangeRate: 1,

    currentExchangeRate: 1,

    workOrderValueINR: 0,

    // ==========================
    // INVOICE INFORMATION
    // ==========================

    invoiceRaised: 0,
    invoiceRaisedINR: 0,

    balanceToBeRaised: 0,
    balanceToBeRaisedINR: 0,

    paymentReceived: 0,
    paymentReceivedINR: 0,

    outstanding: 0,
    outstandingINR: 0,

    paymentStatus: "",

    // ==========================
    // EXPENSE INFORMATION
    // ==========================

    manhourExpenses: 0,

    nonManhourExpenses: 0,

    totalExpenses: 0,

    profit: 0,

    profitPercentage: 0,

    // ==========================
    // QUANTITY INFORMATION
    // ==========================

    quantityItems: [
      {
        id: crypto.randomUUID(),
        description: "",
        woQty: 0,
        invoiceQty: 0,
        pendingQty: 0,
        unitRate: 0,
        pendingAmount: 0,
      },
    ],

    totalWOQty: 0,

    totalInvoiceQty: 0,

    totalPendingQty: 0,

    pendingAmount: 0,

    pendingInvoicePercentage: 0,

    // ==========================
    // DOCUMENT INFORMATION
    // ==========================

    reportLink: "",

    completionCertificate: "",

    projectCompletionDate: "",

    // ==========================
    // PROJECT TEAM
    // ==========================

    projectManager: "",

    projectEngineer: "",

    projectCoordinator: "",

    clientReferenceNo: "",

    remarks: "",

    // ==========================
    // AUDIT
    // ==========================

    createdAt: new Date().toISOString(),

    updatedAt: new Date().toISOString(),
  });

  return (
    <div className="space-y-8">

      <div>
        <h1 className="text-4xl font-bold">
          Add New Project
        </h1>

        <p className="text-gray-500 mt-2">
          Enter complete project information
        </p>
      </div>

      <GeneralInfoCard
        project={project}
        setProject={setProject}
      />

      <CommercialCard
        project={project}
        setProject={setProject}
      />

      <InvoiceCard
        project={project}
        setProject={setProject}
      />

      <ExpenseCard
        project={project}
        setProject={setProject}
      />

      <QuantityCard
        project={project}
        setProject={setProject}
      />

      <DocumentCard
        project={project}
        setProject={setProject}
      />

      <FormButtons
        project={project}
        setProject={setProject}
      />

    </div>
  );
};

export default AddProject;