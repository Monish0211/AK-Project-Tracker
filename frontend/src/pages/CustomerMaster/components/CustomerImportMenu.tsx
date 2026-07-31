import { useEffect, useRef, useState } from "react";
import { ChevronDown, FileDown, Upload } from "lucide-react";
import { Button } from "../../../components/ui/Button";

interface Props {
  onUploadClick: () => void;
  onDownloadTemplate: () => void;
}

const CustomerImportMenu = ({ onUploadClick, onDownloadTemplate }: Props) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <Button variant="secondary" size="sm" icon={<Upload size={13} />} onClick={() => setOpen((prev) => !prev)} className="h-9 shrink-0">
        Import
        <ChevronDown size={12} />
      </Button>

      {open && (
        <div className="absolute left-0 mt-1.5 w-56 bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-[var(--nu-shadow-md)] z-50 nu-fade-in overflow-hidden p-1.5">
          <button
            onClick={() => {
              setOpen(false);
              onUploadClick();
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--nu-radius-md)] text-[12px] font-medium text-[var(--nu-text-secondary)] hover:bg-[var(--nu-surface-alt)] transition-colors"
          >
            <Upload size={14} />
            Upload File (.xlsx / .csv)
          </button>

          <button
            onClick={() => {
              setOpen(false);
              onDownloadTemplate();
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--nu-radius-md)] text-[12px] font-medium text-[var(--nu-text-secondary)] hover:bg-[var(--nu-surface-alt)] transition-colors"
          >
            <FileDown size={14} />
            Download Sample Template
          </button>
        </div>
      )}
    </div>
  );
};

export default CustomerImportMenu;
