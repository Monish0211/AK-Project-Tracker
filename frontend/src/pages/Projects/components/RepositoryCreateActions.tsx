import { ClipboardList, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../../components/ui/Button";

interface RepositoryCreateActionsProps {
  /** Add Project permission (and Projects, not Read Only) — see canAddProject in auth/permissions.ts. */
  canAdd: boolean;
  /** PR Request permission (not Read Only) — see canSubmitPRRequest in auth/permissions.ts. */
  canRequestPR: boolean;
}

/**
 * The Project Repository hero's creation actions. The two buttons are independent: Add Project goes straight to the
 * existing /projects/add form, New PR Request goes to the existing /pr-requests/new approval workflow (no duplicate flow).
 * Renders nothing when the user holds neither, so the hero keeps its normal layout.
 */
const RepositoryCreateActions = ({ canAdd, canRequestPR }: RepositoryCreateActionsProps) => {
  const navigate = useNavigate();
  if (!canAdd && !canRequestPR) return null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2.5" data-testid="repository-create-actions">
      {canAdd && (
        <Button
          variant="hero"
          onClick={() => navigate("/projects/add")}
          className="btn-add transform hover:-translate-y-px"
          icon={<Plus size={15} />}
          data-action="add-project"
        >
          Add Project
        </Button>
      )}
      {canRequestPR && (
        <Button
          variant="hero"
          onClick={() => navigate("/pr-requests/new")}
          className="btn-add transform hover:-translate-y-px"
          icon={<ClipboardList size={15} />}
          data-action="new-pr-request"
        >
          New PR Request
        </Button>
      )}
    </div>
  );
};

export default RepositoryCreateActions;
