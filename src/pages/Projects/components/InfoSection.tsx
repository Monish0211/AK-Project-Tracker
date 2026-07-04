import type { ReactNode } from "react";
import { LayoutGrid } from "lucide-react";

interface Props {
  title: string;
  children: ReactNode;
}

const InfoSection = ({
  title,
  children,
}: Props) => {
  return (
    <div
      className="
        bg-white
        rounded-2xl
        shadow-md
        border
        border-gray-100
        overflow-hidden
      "
    >
      {/* Header */}

      <div className="flex items-center gap-4 px-6 py-5 border-b bg-slate-50">

        <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">

          <LayoutGrid
            size={22}
            className="text-blue-600"
          />

        </div>

        <div>

          <h2 className="text-xl font-bold text-slate-800">
            {title}
          </h2>

          <p className="text-sm text-gray-500">
            Review project information
          </p>

        </div>

      </div>

      {/* Body */}

      <div className="p-6">

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {children}

        </div>

      </div>

    </div>
  );
};

export default InfoSection;