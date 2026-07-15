import { Building2, CalendarDays, UserCheck, UserX } from "lucide-react";
import { StatTile } from "../../../components/ui/StatTile";

interface Props {
  total: number;
  active: number;
  inactive: number;
  addedToday: number;
}

const CustomerKPIStrip = ({ total, active, inactive, addedToday }: Props) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatTile emphasis="secondary" label="Total Customers" value={total.toString()} icon={<Building2 size={14} />} tint="accent" />
      <StatTile emphasis="secondary" label="Active Customers" value={active.toString()} icon={<UserCheck size={14} />} tint="success" />
      <StatTile emphasis="secondary" label="Inactive Customers" value={inactive.toString()} icon={<UserX size={14} />} tint="danger" />
      <StatTile emphasis="secondary" label="Added Today" value={addedToday.toString()} icon={<CalendarDays size={14} />} tint="info" />
    </div>
  );
};

export default CustomerKPIStrip;
