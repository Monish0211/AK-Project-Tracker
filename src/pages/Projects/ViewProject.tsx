import { useNavigate, useParams } from "react-router-dom";
import { Eye, ArrowLeft, Pencil } from "lucide-react";

import { getProjectById } from "../../services/projectService";

import GeneralView from "./components/GeneralView";
import QuantityTable from "./components/QuantityTable";
import BusinessSection from "./components/BusinessSection";
import BillingSection from "./components/BillingSection";
import CostSection from "./components/CostSection";
import DocumentsSection from "./components/DocumentsSection";
import TeamSection from "./components/TeamSection";

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
      <div className="bg-white rounded-2xl shadow-md p-8">

        <h1 className="text-3xl font-bold text-red-600 mb-4">
          Project Not Found
        </h1>

        <button
          onClick={() => navigate("/projects")}
          className="px-5 py-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition"
        >
          Back to Projects
        </button>

      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* ================= Header ================= */}

      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">

        <div className="flex justify-between items-center">

          {/* Left */}

          <div className="flex items-center gap-4">

            <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center">

              <Eye
                size={28}
                className="text-blue-600"
              />

            </div>

            <div>

              <h1 className="text-3xl font-bold text-slate-800">
                View Project
              </h1>

              <p className="text-gray-500 mt-1">
                Review engineering, commercial, billing and project execution details.
              </p>

            </div>

          </div>

          {/* Right */}

          <div className="flex gap-3">

            <button
              onClick={() => navigate("/projects")}
              className="
                flex
                items-center
                gap-2
                px-5
                py-3
                rounded-xl
                border
                border-gray-300
                hover:bg-gray-50
                transition
              "
            >
              <ArrowLeft size={18} />

              Back

            </button>

            <button
              onClick={() =>
                navigate(`/projects/edit/${project.id}`)
              }
              className="
                flex
                items-center
                gap-2
                px-5
                py-3
                rounded-xl
                bg-blue-600
                hover:bg-blue-700
                text-white
                transition
              "
            >
              <Pencil size={18} />

              Edit Project

            </button>

          </div>

        </div>

      </div>

      {/* 1. General Information */}

      <GeneralView project={project} />

      {/* 2. Quantity Details */}

      <QuantityTable
        items={project.quantityItems}
      />

      {/* 3. Commercial Details */}

      <BusinessSection project={project} />

      {/* 4. Billing Information */}

      <BillingSection project={project} />

      {/* 5. Cost Details */}

      <CostSection project={project} />

      {/* 6. Documents */}

      <DocumentsSection project={project} />

      {/* 7. Team Allocation */}

      <TeamSection project={project} />

    </div>
  );
};

export default ViewProject;