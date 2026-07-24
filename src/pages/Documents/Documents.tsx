import { GlassReflectionOverlay } from "../../components/ui/GlassReflectionOverlay";

const Documents = () => {
  return (
    <div className="space-y-6">

      <div className="relative overflow-hidden bg-white rounded-2xl shadow-md border border-gray-100 p-6">
        <GlassReflectionOverlay />

        <h1 className="text-3xl font-bold text-slate-800">
          Documents
        </h1>

        <p className="text-gray-500 mt-2">
          Manage project documents, drawings, work orders, invoices and client files.
        </p>

      </div>

      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-12 flex items-center justify-center">

        <div className="text-center">

          <h2 className="text-xl font-semibold text-slate-700">
            Documents Module
          </h2>

          <p className="mt-2 text-gray-500">
            Coming Soon...
          </p>

        </div>

      </div>

    </div>
  );
};

export default Documents;