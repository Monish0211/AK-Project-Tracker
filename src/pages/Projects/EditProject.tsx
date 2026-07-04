import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import type { Project } from "../../types/Project";

import { createEmptyProject } from "../../utils/createEmptyProject";
import { getProjectById } from "../../services/projectService";

import GeneralInfoCard from "./components/GeneralInfoCard";
import QuantityCard from "./components/QuantityCard";
import CommercialCard from "./components/CommercialCard";
import InvoiceCard from "./components/InvoiceCard";
import ExpenseCard from "./components/ExpenseCard";
import DocumentCard from "./components/DocumentCard";
import FormButtons from "./components/FormButtons";

const EditProject = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  const existingProject = id
    ? getProjectById(id)
    : undefined;

  const [project, setProject] = useState<Project>(
    existingProject ?? createEmptyProject()
  );

  if (!existingProject) {
    return (
      <div className="bg-white rounded-xl shadow-md p-8">
        <h1 className="text-3xl font-bold text-red-600 mb-4">
          Project Not Found
        </h1>

        <button
          type="button"
          onClick={() => navigate("/projects")}
          className="px-5 py-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
        >
          Back to Projects
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* Header */}

      <div>

        <h1 className="text-4xl font-bold text-slate-800">
          Edit Project
        </h1>

        <p className="text-gray-500 mt-2">
          Update project information
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

      {/* 3. Commercial Details */}

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

      {/* Update Button */}

      <FormButtons
        project={project}
        setProject={setProject}
        mode="edit"
      />

    </div>
  );
};

export default EditProject;