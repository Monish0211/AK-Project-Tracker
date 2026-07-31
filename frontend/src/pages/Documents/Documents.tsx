import { GlassReflectionOverlay } from "../../components/ui/GlassReflectionOverlay";

const Documents = () => {
  return (
    <div className="space-y-6">

      <div className="relative overflow-hidden bg-[var(--nu-surface)] rounded-2xl shadow-md border border-[var(--nu-border)] p-6">
        <GlassReflectionOverlay />

        <h1 className="text-3xl font-bold text-[var(--nu-text)]">
          Documents
        </h1>

        <p className="text-[var(--nu-text-muted)] mt-2">
          Manage project documents, drawings, work orders, invoices and client files.
        </p>

      </div>

      <div className="bg-[var(--nu-surface)] rounded-2xl shadow-md border border-[var(--nu-border)] p-12 flex items-center justify-center">

        <div className="text-center">

          <h2 className="text-xl font-semibold text-[var(--nu-text)]">
            Documents Module
          </h2>

          <p className="mt-2 text-[var(--nu-text-muted)]">
            Coming Soon...
          </p>

        </div>

      </div>

    </div>
  );
};

export default Documents;