interface Props {
  label: string;
  value: string | number | null | undefined;
}

const InfoField = ({ label, value }: Props) => {
  return (
    <div
      className="
        bg-white
        border
        border-gray-200
        rounded-xl
        p-4
        transition-all
        duration-200
        hover:shadow-md
        hover:border-blue-200
      "
    >
      {/* Label */}

      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
        {label}
      </p>

      {/* Value */}

      <div className="text-base font-medium text-slate-800 break-words min-h-[28px] flex items-center">

        {value !== "" &&
        value !== null &&
        value !== undefined
          ? value
          : (
            <span className="italic text-gray-400">
              Not Available
            </span>
          )}

      </div>

    </div>
  );
};

export default InfoField;