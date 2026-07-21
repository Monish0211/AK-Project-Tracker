import React from "react";
import { Trophy, ArrowRight, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardBody } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { getTopClients } from "../../../services/dashboardService";
import { formatBusinessINR } from "../../../utils/formatCurrency";

const TopClients: React.FC = () => {
  const navigate = useNavigate();
  const clients = getTopClients();

  return (
    <Card padded={false} className="h-[325px] flex flex-col justify-between bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-md rounded-[var(--nu-radius-lg)] hover:shadow-lg transition-all duration-200">
      {/* Header */}
      <CardHeader
        icon={<Trophy size={14} className="text-amber-500 dark:text-amber-400" />}
        title="TOP CLIENTS"
        subtitle="Ranked by work order value"
        action={
          <button
            type="button"
            onClick={() => navigate("/customers")}
            className="text-[11px] font-semibold text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 transition-colors flex items-center gap-1 hover:underline cursor-pointer shrink-0"
          >
            <span>View All</span>
            <ArrowRight size={12} />
          </button>
        }
      />

      {/* Content Area */}
      <CardBody className="flex-1 overflow-y-auto custom-scrollbar my-1 pr-0.5 min-h-0">
        {clients.length === 0 ? (
          <EmptyState
            icon={<Trophy size={18} />}
            title="No client data available"
            description="Add work order values to projects to see your top clients ranked here."
          />
        ) : (
          <div className="space-y-1 px-3 sm:px-4">
            {clients.map((client, index) => (
              <div
                key={client.client}
                className="flex justify-between items-center rounded-xl px-2.5 py-1.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 border border-transparent hover:border-slate-100 dark:hover:border-slate-800 transition-all duration-150"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-extrabold text-xs shrink-0 border-2 ${
                    index === 0
                      ? "bg-amber-50 border-amber-350 text-amber-700 dark:bg-amber-950/40 dark:border-amber-900/40 dark:text-amber-400"
                      : index === 1
                      ? "bg-slate-50 border-slate-350 text-slate-700 dark:bg-slate-850 dark:border-slate-800 dark:text-slate-350"
                      : index === 2
                      ? "bg-orange-50 border-orange-350 text-orange-700 dark:bg-orange-950/40 dark:border-orange-900/40 dark:text-orange-400"
                      : "bg-slate-50/60 border-slate-200 text-slate-500 dark:bg-slate-850/60 dark:border-slate-800/30 dark:text-slate-400"
                  }`}>
                    {index + 1}
                  </div>
                  <p className="text-[12px] font-bold text-slate-800 dark:text-slate-200 truncate" title={client.client}>
                    {client.client}
                  </p>
                </div>
                <p className="text-[12px] font-extrabold text-slate-900 dark:text-white shrink-0" title={`₹ ${client.workOrderValue.toLocaleString("en-IN")}`}>
                  {formatBusinessINR(client.workOrderValue)}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardBody>

      {/* Bottom Summary Strip (Fixed) */}
      <div className="shrink-0 bg-slate-50/80 dark:bg-slate-800/40 border-t border-slate-200/60 dark:border-slate-800/60 p-2 px-3 sm:px-4 rounded-b-[var(--nu-radius-lg)] flex items-center justify-between flex-wrap gap-1.5 text-[11px] font-semibold text-slate-650 dark:text-slate-400">
        <div className="flex items-center gap-1.5 truncate">
          <Info size={13} className="text-slate-450 shrink-0" />
          <span className="truncate">Top clients ranked by commercial work order value.</span>
        </div>
        <button
          type="button"
          onClick={() => navigate("/customers")}
          className="text-amber-600 dark:text-amber-400 hover:underline transition-colors flex items-center gap-1 font-bold cursor-pointer ml-auto sm:ml-0"
        >
          <span>View All Clients</span>
          <ArrowRight size={12} />
        </button>
      </div>
    </Card>
  );
};

export default TopClients;
