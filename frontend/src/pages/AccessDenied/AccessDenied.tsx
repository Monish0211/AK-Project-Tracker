import { useNavigate } from "react-router-dom";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { Button } from "../../components/ui/Button";

interface AccessDeniedProps {
  moduleName?: string;
}

/**
 * Rendered by ModuleRoute in place of a page's real content when the
 * logged-in user doesn't have that module's permission — a manually typed
 * URL for a module the user lacks lands here instead of the real page.
 */
export default function AccessDenied({ moduleName }: AccessDeniedProps) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="max-w-md w-full text-center bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-[var(--nu-shadow-md)] p-8">
        <div className="w-14 h-14 mx-auto rounded-full bg-[var(--nu-danger-soft)] text-[var(--nu-danger)] flex items-center justify-center mb-4">
          <ShieldAlert size={28} />
        </div>
        <h1 className="text-lg font-bold text-[var(--nu-text)]">403 — Access Denied</h1>
        <p className="text-[13px] text-[var(--nu-text-muted)] mt-2 leading-relaxed">
          {moduleName
            ? `You don't have access to the "${moduleName}" module. Contact your administrator if you believe this is a mistake.`
            : "You don't have access to this page. Contact your administrator if you believe this is a mistake."}
        </p>
        <div className="mt-6">
          <Button variant="primary" size="sm" icon={<ArrowLeft size={14} />} onClick={() => navigate(-1)}>
            Go Back
          </Button>
        </div>
      </div>
    </div>
  );
}
