import type { ReactNode } from "react";

interface Props {
  title: string;
  children: ReactNode;
}

const InfoSection = ({
  title,
  children,
}: Props) => {
  return (
    <div className="bg-white rounded-xl shadow-md p-6">

      <h2 className="text-2xl font-semibold mb-6 border-b pb-3">
        {title}
      </h2>

      <div className="grid grid-cols-2 gap-6">
        {children}
      </div>

    </div>
  );
};

export default InfoSection;