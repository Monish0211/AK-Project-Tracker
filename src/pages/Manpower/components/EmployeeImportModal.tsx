import { useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { CheckCircle2, X } from "lucide-react";

interface Props {
  onClose: () => void;
  onImport: (file: File) => void;
  onDownloadTemplate: () => void;
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function validateFile(file: File): string | null {
  const isXlsx = file.name.toLowerCase().endsWith(".xlsx");

  if (!isXlsx) {
    return "Only .xlsx files are supported.";
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return "File size must not exceed 10 MB.";
  }

  return null;
}

const EmployeeImportModal = ({
  onClose,
  onImport,
  onDownloadTemplate,
}: Props) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [error, setError] = useState("");

  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const dragCounterRef = useRef(0);

  const handleFile = (file: File) => {
    const validationError = validateFile(file);

    if (validationError) {
      setSelectedFile(null);
      setError(validationError);
      return;
    }

    setError("");
    setSelectedFile(file);
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (file) {
      handleFile(file);
    }
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    dragCounterRef.current += 1;
    setIsDragOver(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    dragCounterRef.current -= 1;

    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragOver(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    dragCounterRef.current = 0;
    setIsDragOver(false);

    const file = event.dataTransfer.files?.[0];

    if (file) {
      handleFile(file);
    }
  };

  const handleImportClick = () => {
    if (!selectedFile) return;

    onImport(selectedFile);
  };

  const canImport = Boolean(selectedFile) && !error;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">

      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">

        {/* Header */}

        <div className="flex justify-between items-center border-b p-6">

          <div>

            <h2 className="text-2xl font-bold text-slate-800">
              Import Employee Master
            </h2>

            <p className="text-sm text-gray-500 mt-1">
              Upload an Excel file to bulk import employee records.
            </p>

          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <X size={20} />
          </button>

        </div>

        {/* Body */}

        <div className="p-6 space-y-5">

          <div
            onClick={handleBrowseClick}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              rounded-2xl border-2 border-dashed p-10
              flex flex-col items-center justify-center text-center
              cursor-pointer transition-colors duration-150
              ${
                isDragOver
                  ? "border-blue-500 bg-blue-50"
                  : selectedFile
                  ? "border-green-300 bg-green-50"
                  : "border-gray-300 bg-gray-50 hover:bg-gray-100"
              }
            `}
          >

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={handleInputChange}
            />

            {selectedFile ? (

              <>

                <CheckCircle2
                  size={40}
                  strokeWidth={1.75}
                  className="text-green-600 mb-3"
                />

                <p className="text-sm font-medium text-gray-500">
                  Selected File
                </p>

                <p className="mt-1 text-base font-semibold text-slate-800 break-all">
                  {selectedFile.name}
                </p>

                <p className="mt-1 text-xs text-gray-400">
                  {formatFileSize(selectedFile.size)}
                </p>

                <p className="mt-3 text-sm font-semibold text-green-600">
                  ✓ Ready to Import
                </p>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBrowseClick();
                  }}
                  className="mt-4 text-sm font-medium text-blue-600 hover:underline"
                >
                  Choose a different file
                </button>

              </>

            ) : (

              <>

                <div className="text-5xl mb-3">
                  📄
                </div>

                <p className="text-base font-semibold text-slate-800">
                  Drag &amp; Drop Excel File Here
                </p>

                <p className="my-3 text-xs font-medium uppercase tracking-wide text-gray-400">
                  OR
                </p>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBrowseClick();
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-blue-600 text-blue-600 hover:bg-blue-50 transition"
                >
                  Browse Excel File
                </button>

                <p className="mt-4 text-xs text-gray-400">
                  Accepted format: .xlsx &nbsp;|&nbsp; Maximum size: 10 MB
                </p>

              </>

            )}

          </div>

          {error && (
            <div className="text-red-600 text-sm font-medium">
              {error}
            </div>
          )}

          {/* Sample Template */}

          <div className="border-t pt-5 text-center">

            <p className="text-sm text-gray-500">
              Don&apos;t have the template?
            </p>

            <button
              type="button"
              onClick={onDownloadTemplate}
              className="mt-1 text-sm font-medium text-blue-600 hover:underline"
            >
              ⬇ Download Sample Template
            </button>

          </div>

        </div>

        {/* Footer */}

        <div className="flex justify-end gap-3 border-t p-6">

          <button
            onClick={onClose}
            className="
              px-5
              py-2.5
              rounded-xl
              border
              hover:bg-gray-100
            "
          >
            Cancel
          </button>

          <button
            onClick={handleImportClick}
            disabled={!canImport}
            className={`
              px-5
              py-2.5
              rounded-xl
              text-white
              transition
              ${
                canImport
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-gray-300 cursor-not-allowed"
              }
            `}
          >
            Import
          </button>

        </div>

      </div>

    </div>
  );
};

export default EmployeeImportModal;
