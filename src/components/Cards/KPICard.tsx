import type { ReactNode } from "react";

interface KPICardProps {
  title: string;
  value: string;
  icon: ReactNode;
}

const KPICard = ({ title, value, icon }: KPICardProps) => {
  return (
    <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-xl transition-all duration-300">
      <div>{icon}</div>

      <p className="text-gray-500 mt-4">
        {title}
      </p>

      <h2 className="text-3xl font-bold mt-2">
        {value}
      </h2>
    </div>
  );
};

export default KPICard;