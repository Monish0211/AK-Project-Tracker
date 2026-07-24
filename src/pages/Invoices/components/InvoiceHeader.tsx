import { useNavigate } from "react-router-dom";
import { FileText, Plus } from "lucide-react";
import { GlassReflectionOverlay } from "../../../components/ui/GlassReflectionOverlay";
import { Button } from "../../../components/ui/Button";

const InvoiceHeader = () => {
  const navigate = useNavigate();

  return (
    <div className="relative overflow-hidden bg-white rounded-2xl shadow-md border border-gray-100 p-6">
      <GlassReflectionOverlay />

      <div className="flex items-center justify-between">

        {/* Left */}

        <div className="flex items-center gap-4">

          <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center">

            <FileText
              size={28}
              className="text-blue-600"
            />

          </div>

          <div>

            <h1 className="text-3xl font-bold text-slate-800">
              Invoices
            </h1>

            <p className="text-gray-500 mt-1">
              Manage project invoices, payment collections and outstanding balances.
            </p>

          </div>

        </div>

        {/* Right */}

        <Button variant="primary" onClick={() => navigate("/invoices/add")} icon={<Plus size={18} />}>
          Add Invoice
        </Button>

      </div>

    </div>
  );
};

export default InvoiceHeader;