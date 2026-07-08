import { useState } from "react";
import type { Project } from "../../types/Project";
import { createEmptyProject } from "../../utils/createEmptyProject";

import GeneralInfoCard from "./components/GeneralInfoCard";
import QuantityCard from "./components/QuantityCard";
import CommercialCard from "./components/PaymentMilestoneCard";
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

      {/* 3. Payment Milestones */}

      <CommercialCard
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