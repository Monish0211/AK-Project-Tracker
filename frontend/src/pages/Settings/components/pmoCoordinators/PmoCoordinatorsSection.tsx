import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Pencil, Plus, Trash2, UserCheck } from "lucide-react";
import { Card, CardHeader } from "../../../../components/ui/Card";
import { Badge } from "../../../../components/ui/Badge";
import type { Tone } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { ConfirmDialog } from "../../../../components/ui/ConfirmDialog";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { usePmoToast } from "../../../../components/ui/usePmoToast";
import { ApiError } from "../../../../services/apiClient";
import {
  getPmoCoordinatorRegistry,
  removePmoCoordinator,
  PMO_COORDINATOR_STATUS_LABELS,
  type PmoCoordinatorEntry,
  type PmoCoordinatorStatus,
} from "../../../../services/pmoCoordinatorService";
import { PmoCoordinatorFormModal } from "./PmoCoordinatorFormModal";

const STATUS_TONE: Record<PmoCoordinatorStatus, Tone> = {
  eligible: "success",
  no_account: "neutral",
  ambiguous_account: "danger",
  inactive: "warning",
  locked: "danger",
  no_projects_module: "warning",
};

/**
 * Settings → PMO Coordinators (Oct 2026). The registry the General
 * Information picker lists. Shown to Administrator / PMO Manager only
 * (Settings.tsx); the backend enforces the same roles plus the Settings
 * module on every call. Account status is computed live by the backend —
 * nothing here creates accounts or grants access.
 */
export const PmoCoordinatorsSection = () => {
  const { showToast } = usePmoToast();
  const [entries, setEntries] = useState<PmoCoordinatorEntry[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PmoCoordinatorEntry | undefined>(undefined);
  const [removeTarget, setRemoveTarget] = useState<PmoCoordinatorEntry | undefined>(undefined);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await getPmoCoordinatorRegistry());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load PMO Coordinators.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load — state is only set from the request's callbacks.
  useEffect(() => {
    let isMounted = true;
    getPmoCoordinatorRegistry()
      .then((items) => {
        if (isMounted) setEntries(items);
      })
      .catch((err) => {
        if (isMounted) setError(err instanceof ApiError ? err.message : "Failed to load PMO Coordinators.");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => e.displayName.toLowerCase().includes(q) || e.email.toLowerCase().includes(q));
  }, [entries, search]);

  const eligibleCount = entries.filter((e) => e.status === "eligible").length;

  const handleRemove = async () => {
    const target = removeTarget;
    setRemoveTarget(undefined);
    if (!target) return;
    try {
      await removePmoCoordinator(target.id);
      setEntries((prev) => prev.filter((e) => e.id !== target.id));
      showToast({ type: "success", message: `${target.displayName} was removed from PMO Coordinators.` });
    } catch (err) {
      showToast({ type: "error", message: err instanceof ApiError ? err.message : "Failed to remove the PMO Coordinator." });
      refresh();
    }
  };

  const upsert = (saved: PmoCoordinatorEntry) => {
    setEntries((prev) => {
      const next = prev.some((e) => e.id === saved.id) ? prev.map((e) => (e.id === saved.id ? saved : e)) : [...prev, saved];
      return next.sort((a, b) => a.displayName.localeCompare(b.displayName));
    });
  };

  return (
    <div className="space-y-4 nu-fade-in">
      <Card padded={false} elevated>
        <CardHeader
          icon={<UserCheck size={15} />}
          title="PMO Coordinators"
          subtitle="People who can be chosen as a project's PMO Coordinator. The assigned coordinator can view and edit that project. Accounts are matched by email."
          action={
            <div className="flex items-center gap-3 text-[11px] font-semibold text-[var(--nu-text-muted)]">
              <span>{entries.length} registered</span>
              <span className="text-[var(--nu-success)]">{eligibleCount} eligible</span>
            </div>
          }
        />

        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3 border-b border-[var(--nu-border)]">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email..."
            className="h-9 flex-1 min-w-[180px] px-2.5 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] text-[12.5px] text-[var(--nu-text)] outline-none focus:ring-2 focus:ring-[var(--nu-accent)]/30 focus:border-[var(--nu-accent)]"
          />
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setIsAddOpen(true)}>
            Add Coordinator
          </Button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-[var(--nu-text-muted)]">
            <Loader2 size={22} className="animate-spin" />
            <span className="text-[12px] font-medium">Loading PMO Coordinators...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-center px-4">
            <AlertTriangle size={22} className="text-[var(--nu-danger)]" />
            <p className="text-[12.5px] font-semibold text-[var(--nu-text)]">Couldn't load PMO Coordinators</p>
            <p className="text-[11.5px] text-[var(--nu-text-muted)] max-w-sm">{error}</p>
            <button
              type="button"
              onClick={refresh}
              className="mt-2 text-[11.5px] font-semibold text-[var(--nu-accent)] hover:underline cursor-pointer"
            >
              Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<UserCheck size={20} />} title="No PMO Coordinators found" description="Try adjusting your search, or add a coordinator." />
        ) : (
          <div className="overflow-auto nu-scrollbar max-h-[calc(100vh-320px)]">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[var(--nu-surface-alt)] text-[10.5px] uppercase tracking-wide text-[var(--nu-text-muted)] border-b border-[var(--nu-border)]">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Account status</th>
                  <th className="px-4 py-3 font-medium text-center">Projects</th>
                  <th className="px-4 py-3 font-medium text-center w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry, index) => {
                  const assigned = entry.assignedProjectCount > 0;
                  return (
                    <tr
                      key={entry.id}
                      className={`border-b border-[var(--nu-border)] last:border-none hover:bg-[var(--nu-accent-soft)] transition-colors ${
                        index % 2 === 1 ? "bg-[var(--nu-surface-alt)]" : "bg-[var(--nu-surface)]"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <span className="text-[13px] font-semibold text-[var(--nu-text)]">{entry.displayName}</span>
                        {entry.account && entry.account.fullName !== entry.displayName && (
                          <span className="block text-[11px] text-[var(--nu-text-muted)]">Account: {entry.account.fullName}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-[var(--nu-text-secondary)] break-all">{entry.email}</td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONE[entry.status]} dot>
                          {PMO_COORDINATOR_STATUS_LABELS[entry.status]}
                        </Badge>
                        {entry.reasons.length > 1 && (
                          <span className="block mt-1 text-[10.5px] text-[var(--nu-text-muted)]">
                            Also: {entry.reasons.slice(1).map((r) => PMO_COORDINATOR_STATUS_LABELS[r]).join(", ")}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-[12.5px] font-semibold text-[var(--nu-text)]">
                        {entry.assignedProjectCount}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            title="Edit"
                            onClick={() => setEditTarget(entry)}
                            className="w-7 h-7 rounded-[var(--nu-radius-md)] bg-[var(--nu-surface-alt)] text-[var(--nu-text-secondary)] hover:bg-[var(--nu-accent-soft)] hover:text-[var(--nu-accent)] border border-[var(--nu-border)] inline-flex items-center justify-center transition-colors cursor-pointer"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            title={assigned ? "Assigned to projects. Reassign them before removing." : "Remove"}
                            onClick={() => setRemoveTarget(entry)}
                            disabled={assigned}
                            className="w-7 h-7 rounded-[var(--nu-radius-md)] bg-[var(--nu-surface-alt)] text-[var(--nu-text-secondary)] hover:bg-[var(--nu-danger-soft)] hover:text-[var(--nu-danger)] border border-[var(--nu-border)] inline-flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[var(--nu-surface-alt)] disabled:hover:text-[var(--nu-text-secondary)]"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {isAddOpen && (
        <PmoCoordinatorFormModal
          onCancel={() => setIsAddOpen(false)}
          onSaved={(saved) => {
            upsert(saved);
            setIsAddOpen(false);
            showToast({ type: "success", message: `${saved.displayName} was added to PMO Coordinators.` });
          }}
        />
      )}

      {editTarget && (
        <PmoCoordinatorFormModal
          entry={editTarget}
          onCancel={() => setEditTarget(undefined)}
          onSaved={(saved) => {
            upsert(saved);
            setEditTarget(undefined);
            showToast({ type: "success", message: `${saved.displayName} was updated.` });
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title="Remove PMO Coordinator"
        message={
          <>
            Remove <strong>{removeTarget?.displayName}</strong> ({removeTarget?.email}) from the list? They can no longer be
            chosen for projects. Their PMO Portal account is not changed.
          </>
        }
        confirmLabel="Remove"
        variant="danger"
        onConfirm={handleRemove}
        onCancel={() => setRemoveTarget(undefined)}
      />
    </div>
  );
};
