interface Props {
  label: string;
  value: string | number | null | undefined;
}

const InfoField = ({ label, value }: Props) => {
  const hasValue = value !== "" && value !== null && value !== undefined;

  return (
    <div className="bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-[var(--nu-radius-md)] p-3 transition-colors duration-150 hover:border-[var(--nu-border-strong)]">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)] mb-1">{label}</p>
      <div className="text-[13.5px] font-semibold text-[var(--nu-text)] break-words min-h-[20px] flex items-center">
        {hasValue ? value : <span className="italic text-[var(--nu-text-muted)] font-normal">Not Available</span>}
      </div>
    </div>
  );
};

export default InfoField;
