import { useState } from "react";
import type { Project } from "../../types/Project";
import { createEmptyProject } from "../../utils/createEmptyProject";

import GeneralInfoCard from "./components/GeneralInfoCard";
import CommercialCard from "./components/CommercialCard";
import InvoiceCard from "./components/InvoiceCard";
import ExpenseCard from "./components/ExpenseCard";
import QuantityCard from "./components/QuantityCard";
import DocumentCard from "./components/DocumentCard";
import FormButtons from "./components/FormButtons";

const AddProject = () => {
  const [project, setProject] = useState<Project>(
    createEmptyProject()
  );

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
        mode="add"
      />

    </div>
  );
};

export default AddProject;