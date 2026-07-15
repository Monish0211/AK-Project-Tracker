import { Trophy } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardBody, CardFooter } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { getTopClients } from "../../../services/dashboardService";

const TopClients = () => {
  const navigate = useNavigate();
  const clients = getTopClients();

  return (
    <Card padded={false} className="flex flex-col min-h-[360px]">
      <CardHeader icon={<Trophy size={15} />} title="Top Clients" subtitle="Ranked by work order value" iconTint="neutral" />
      <CardBody className="flex-1">
        {clients.length === 0 ? (
          <EmptyState
            icon={<Trophy size={18} />}
            title="No client data available"
            description="Add work order values to projects to see your top clients ranked here."
          />
        ) : (
          <div className="space-y-1">
            {clients.map((client, index) => (
              <div
                key={client.client}
                className="flex justify-between items-center rounded-[var(--nu-radius-md)] px-2 py-2 hover:bg-[var(--nu-surface-alt)] transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] flex items-center justify-center font-semibold text-[var(--nu-text-secondary)] text-[11px] shrink-0">
                    {index + 1}
                  </div>
                  <p className="text-[12.5px] font-medium text-[var(--nu-text)] truncate" title={client.client}>
                    {client.client}
                  </p>
                </div>
                <p className="text-[12.5px] font-semibold text-[var(--nu-text)] shrink-0">
                  ₹ {client.workOrderValue.toLocaleString("en-IN")}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardBody>
      <CardFooter>
        <Button variant="secondary" size="sm" className="w-full justify-center" onClick={() => navigate("/customers")}>
          View All Clients
        </Button>
      </CardFooter>
    </Card>
  );
};

export default TopClients;
