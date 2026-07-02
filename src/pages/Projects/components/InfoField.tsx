interface Props {
  label: string;
  value: string | number | null | undefined;
}

const InfoField = ({ label, value }: Props) => {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-gray-600">
        {label}
      </label>

      <div className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 min-h-[48px] flex items-center">
        {value !== "" &&
        value !== null &&
        value !== undefined
          ? value
          : "-"}
      </div>
    </div>
  );
};

export default InfoField;