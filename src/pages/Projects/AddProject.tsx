import { useState } from "react";
import type { Project } from "../../types/Project";
import { createEmptyProject } from "../../utils/createEmptyProject";

import GeneralInfoCard from "./components/GeneralInfoCard";
import QuantityCard from "./components/QuantityCard";
import CommercialCard from "./components/PaymentMilestoneCard";
import InvoiceCard from "./components/InvoiceCard";
import ExpenseCard from "./components/ExpenseCard";
import DocumentCard from "./components/DocumentCard";
import FormButtons from "./components/FormButtons";

const AddProject = () => {
  const [project, setProject] = useState<Project>(
    createEmptyProject()
  );

  return (
    <div className="space-y-8">

      {/* Page Header */}

      <div>

        <h1 className="text-4xl font-bold text-slate-800">
          Add New Project
        </h1>

        <p className="text-gray-500 mt-2">
          Enter complete project information
        </p>

      </div>

      {/* 1. General Information */}

      <GeneralInfoCard
        project={project}
        setProject={setProject}
      />

      {/* 2. Quantity Details */}

      <QuantityCard
        project={project}
        setProject={setProject}
      />

      {/* 3. Commercial Information */}

      <CommercialCard
        project={project}
        setProject={setProject}
      />

      {/* 4. Invoice Information */}

      <InvoiceCard
        project={project}
        setProject={setProject}
      />

      {/* 5. Expense Information */}

      <ExpenseCard
        project={project}
        setProject={setProject}
      />

      {/* 6. Documents */}

      <DocumentCard
        project={project}
        setProject={setProject}
      />

      {/* Save / Cancel */}

      <FormButtons
        project={project}
        setProject={setProject}
        mode="add"
      />

    </div>
  );
};

export default AddProject;