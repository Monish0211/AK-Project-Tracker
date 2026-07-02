import { useNavigate, useParams } from "react-router-dom";

import { getProjectById } from "../../services/projectService";

import GeneralView from "./components/GeneralView";
import BusinessSection from "./components/BusinessSection";
import BillingSection from "./components/BillingSection";
import CostSection from "./components/CostSection";
import DocumentsSection from "./components/DocumentsSection";
import TeamSection from "./components/TeamSection";
import QuantityTable from "./components/QuantityTable";

const ViewProject = () => {
  const { id } = useParams();

  const navigate = useNavigate();

  if (!id) {
    return (
      <div className="text-center mt-10">
        Invalid Project Id
      </div>
    );
  }

  const project = getProjectById(id);

  if (!project) {
    return (
      <div className="bg-white rounded-xl shadow-md p-8">

        <h1 className="text-3xl font-bold text-red-600 mb-4">
          Project Not Found
        </h1>

        <button
          onClick={() => navigate("/projects")}
          className="px-5 py-3 rounded-lg bg-blue-600 text-white"
        >
          Back to Projects
        </button>

      </div>
    );
  }

  return (
    <div className="space-y-8">

      <div className="flex justify-between items-center">

        <h1 className="text-4xl font-bold">
          View Project
        </h1>

        <div className="flex gap-3">

          <button
            onClick={() => navigate("/projects")}
            className="px-5 py-3 rounded-lg border"
          >
            Back
          </button>

          <button
            onClick={() =>
              navigate(`/projects/edit/${project.id}`)
            }
            className="px-5 py-3 rounded-lg bg-blue-600 text-white"
          >
            Edit Project
          </button>

        </div>

      </div>

      <GeneralView project={project} />

      <BusinessSection project={project} />

      <BillingSection project={project} />

      <CostSection project={project} />

      <QuantityTable
        items={project.quantityItems}
      />

      <DocumentsSection project={project} />

      <TeamSection project={project} />

    </div>
  );
};

export default ViewProject;