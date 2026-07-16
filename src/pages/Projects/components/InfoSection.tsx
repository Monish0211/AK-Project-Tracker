import type { ReactNode } from "react";
import { LayoutGrid } from "lucide-react";
import { Card, CardBody, CardHeader } from "../../../components/ui/Card";

interface Props {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
}

const InfoSection = ({ title, subtitle = "Review project information", icon, children }: Props) => {
  return (
    <Card padded={false}>
      <CardHeader icon={icon ?? <LayoutGrid size={16} />} title={title} subtitle={subtitle} />
      <CardBody>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">{children}</div>
      </CardBody>
    </Card>
  );
};

export default InfoSection;
