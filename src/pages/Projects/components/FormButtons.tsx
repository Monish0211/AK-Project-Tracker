import { Save, RotateCcw, X } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { Project } from "../../../types/Project";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
}

const FormButtons = ({
  project,
  setProject,
}: Props) => {

  const handleSave = () => {
    if (
      project.prNo.trim() === "" ||
      project.client.trim() === "" ||
      project.projectTitle.trim() === ""
    ) {
      alert(
        "Please fill PR Number, Client and Project Title."
      );
      return;
    }

    const existingProjects: Project[] = JSON.parse(
      localStorage.getItem("projects") || "[]"
    );

    const updatedProjects = [
      ...existingProjects,
      {
        ...project,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    localStorage.setItem(
      "projects",
      JSON.stringify(updatedProjects)
    );

    console.log(updatedProjects);

    alert("Project Saved Successfully!");
  };

  const handleReset = () => {
    if (
      window.confirm(
        "Are you sure you want to reset the form?"
      )
    ) {
      setProject({
        ...project,

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

        contractFormalities: "",
        paymentTerms: "",

        workOrderValue: 0,
        currency: "",
        contractExchangeRate: 1,
        currentExchangeRate: 1,
        workOrderValueINR: 0,

        invoiceRaised: 0,
        invoiceRaisedINR: 0,

        paymentReceived: 0,
        paymentReceivedINR: 0,

        balanceToBeRaised: 0,
        balanceToBeRaisedINR: 0,

        outstanding: 0,
        outstandingINR: 0,

        paymentStatus: "",

        manhourExpenses: 0,
        nonManhourExpenses: 0,
        totalExpenses: 0,
        profit: 0,
        profitPercentage: 0,

        totalWOQty: 0,
        totalInvoiceQty: 0,
        totalPendingQty: 0,
        pendingAmount: 0,
        pendingInvoicePercentage: 0,

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

        reportLink: "",
        completionCertificate: "",
        projectCompletionDate: "",

        projectManager: "",
        projectEngineer: "",
        projectCoordinator: "",

        clientReferenceNo: "",
        remarks: "",

        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  };

  const handleCancel = () => {
    if (
      window.confirm(
        "Are you sure you want to cancel?"
      )
    ) {
      window.history.back();
    }
  };

  return (
    <div className="flex justify-end gap-4 mt-8">

      <button
        type="button"
        onClick={handleReset}
        className="flex items-center gap-2 px-5 py-3 rounded-lg border border-yellow-500 text-yellow-600 hover:bg-yellow-50 transition"
      >
        <RotateCcw size={18} />
        Reset
      </button>

      <button
        type="button"
        onClick={handleCancel}
        className="flex items-center gap-2 px-5 py-3 rounded-lg border border-red-500 text-red-600 hover:bg-red-50 transition"
      >
        <X size={18} />
        Cancel
      </button>

      <button
        type="button"
        onClick={handleSave}
        className="flex items-center gap-2 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition"
      >
        <Save size={18} />
        Save Project
      </button>

    </div>
  );
};

export default FormButtons;