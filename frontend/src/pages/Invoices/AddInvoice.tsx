import { useNavigate } from "react-router-dom";

import InvoiceForm from "./components/InvoiceForm";

import { getProjects } from "../../services/projectService";
import { addInvoice } from "../../services/invoiceService";

import type { Invoice } from "../../types/Invoice";

const AddInvoice = () => {
  const navigate = useNavigate();

  const projects = getProjects();

  const handleSubmit = (invoice: Invoice) => {
    addInvoice(invoice);

    alert("Invoice added successfully!");

    navigate("/invoices");
  };

  return (
    <div className="space-y-6">
      <InvoiceForm
        projects={projects}
        onSubmit={handleSubmit}
        onCancel={() => navigate("/invoices")}
      />
    </div>
  );
};

export default AddInvoice;