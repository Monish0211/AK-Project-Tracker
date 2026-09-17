import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, NotebookText, Search } from "lucide-react";
import { fetchAllNotesForCaller, type AllNotesListItem } from "../../services/notesService";

// Sept 2026 — dedicated, READ-ONLY Notes register. Deliberately NOT the
// earlier Project Repository Notes-column design: this page has no link to
// the Project Workspace, no PR-number navigation, no note count anywhere
// else in the app, and cannot create/edit/delete a note. It exists purely
// to let anyone with Projects access see every note across every project
// they're authorized to see, grouped by project. The existing Project
// Workspace Notes tab (ProjectNotesService.ts) remains the only place a
// note is ever created or edited — this page only reads.

// A note's text collapses to a short preview beyond this many characters —
// long enough to read as a real preview, short enough that a long note
// never dominates its row. Purely a display concern; the full message is
// always in memory (never re-fetched), "More" just reveals it.
const NOTE_PREVIEW_CHAR_LIMIT = 160;

/** Cuts at the nearest earlier word boundary (never mid-word) so the preview reads cleanly, then appends an ellipsis. */
function truncateNoteText(message: string, limit: number): string {
  if (message.length <= limit) return message;
  const cut = message.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  const clean = lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${clean}…`;
}

/** "10-Sep-2026 16:45" — date+time for both a group's "Latest activity" line and each note row. */
function formatNoteDateTime(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "—";
  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}-${month}-${year} ${hours}:${minutes}`;
}

interface NoteProjectGroup {
  /** The grouping key — the project's real id, exactly as the backend already attaches to each note. Never a re-derived/normalized PR code. */
  projectId: string;
  /** Display value only — copied verbatim from the note's own prNo, never rewritten/normalized/merged with a similar-looking one. */
  prNo: string;
  /** Newest first. */
  notes: AllNotesListItem[];
  latestActivityIso: string;
}

export default function Notes() {
  const [notes, setNotes] = useState<AllNotesListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  // Expanded-by-projectId; a project starts here ONLY once a user
  // explicitly clicks it — every group (including the newest) renders
  // COLLAPSED by default, on first load and on every refresh. See
  // isGroupExpanded() below for the one exception (an active search).
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(new Set());
  // Per-NOTE text expansion — entirely independent of expandedProjectIds
  // above (that's per-project). A note id starts here only once a user
  // explicitly clicks "More"; every long note renders collapsed by default.
  const [expandedNoteIds, setExpandedNoteIds] = useState<Set<string>>(new Set());
  const groupsPerPage = 10;

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setLoadError(null);

    fetchAllNotesForCaller()
      .then((items) => {
        if (!isMounted) return;
        setNotes(items);
      })
      .catch((error) => {
        console.error("Failed to load Notes register:", error);
        if (isMounted) setLoadError("Unable to load notes from the server. Please try again.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Matches PR No / note text / author — same as before grouping existed.
  // Filters individual notes first; grouping (below) is derived from this
  // already-filtered set, so a search never merges or splits a project
  // group, it only narrows which notes/groups are present.
  const filteredNotes = useMemo(() => {
    if (!search.trim()) return notes;
    const q = search.trim().toLowerCase();
    return notes.filter(
      (n) =>
        n.prNo.toLowerCase().includes(q) ||
        n.message.toLowerCase().includes(q) ||
        n.createdBy.toLowerCase().includes(q)
    );
  }, [notes, search]);

  // Groups by note.projectId — the real project identity the backend
  // already attaches to every note (see notesService.ts's
  // AllNotesListItem). This is the ONLY grouping key used; prNo is read
  // straight off a note purely for display and is never parsed, normalized,
  // or compared between projects, so two similar-looking PR numbers on
  // different projects (e.g. "PR 12034" and "PR-12034_01") can never be
  // merged into one group — they simply have different projectId values.
  const groupedProjects = useMemo<NoteProjectGroup[]>(() => {
    const byProjectId = new Map<string, AllNotesListItem[]>();
    for (const note of filteredNotes) {
      const bucket = byProjectId.get(note.projectId);
      if (bucket) bucket.push(note);
      else byProjectId.set(note.projectId, [note]);
    }

    const groups: NoteProjectGroup[] = [];
    byProjectId.forEach((notesForProject, projectId) => {
      const sortedNotes = [...notesForProject].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      groups.push({
        projectId,
        prNo: sortedNotes[0]!.prNo,
        notes: sortedNotes,
        latestActivityIso: sortedNotes[0]!.createdAt,
      });
    });

    // Newest project activity first.
    groups.sort((a, b) => new Date(b.latestActivityIso).getTime() - new Date(a.latestActivityIso).getTime());
    return groups;
  }, [filteredNotes]);

  const totalPages = Math.max(Math.ceil(groupedProjects.length / groupsPerPage), 1);
  const paginatedGroups = useMemo(() => {
    const start = (currentPage - 1) * groupsPerPage;
    return groupedProjects.slice(start, start + groupsPerPage);
  }, [groupedProjects, currentPage]);

  const toggleGroup = (projectId: string) => {
    setExpandedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  // While a search is active, every group left after filtering (see
  // filteredNotes above) is exactly the set that already contains a
  // matching note — so auto-expanding all of them here is enough to
  // guarantee every match is visible, without a second "which groups
  // contain a match" computation. Manual expand/collapse clicks (recorded
  // in expandedProjectIds) are preserved underneath and take back over the
  // instant the search box is cleared.
  const isSearchActive = search.trim().length > 0;
  const isGroupExpanded = (projectId: string) => isSearchActive || expandedProjectIds.has(projectId);

  const toggleNoteExpanded = (noteId: string) => {
    setExpandedNoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) next.delete(noteId);
      else next.add(noteId);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Hero Header */}
      <div className="rounded-2xl p-4 sm:p-6 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-lg border border-blue-900/40 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              Read-Only Register
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Notes</h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl">
              Every note across every project you have access to, grouped by project. This page is view-only — open a
              project's Workspace to add or edit a note.
            </p>
          </div>

          <div className="bg-blue-950/80 border border-blue-800/60 rounded-xl px-3.5 py-2 text-right shrink-0">
            <p className="text-[10px] uppercase font-bold text-blue-300">Total Notes</p>
            <p className="text-xl font-black text-white">{notes.length}</p>
          </div>
        </div>
      </div>

      {/* Main Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col min-h-0">
        {/* Card Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center rounded-xl text-blue-600 dark:text-blue-400">
              <NotebookText size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Notes Register</h2>
              <p className="text-xs text-slate-400">Grouped by project, newest project activity first.</p>
            </div>
          </div>
          <span className="text-xs font-bold px-3 py-1 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 rounded-full border border-blue-200 dark:border-blue-900/50">
            Showing {filteredNotes.length} of {notes.length} Notes across {groupedProjects.length} project
            {groupedProjects.length === 1 ? "" : "s"}
          </span>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 p-3 bg-slate-50/50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800 flex-wrap">
          <div className="relative flex-1 max-w-[320px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search PR No · Note text · Added by..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-8 pr-8 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 outline-none focus:border-blue-500"
            />
            {search && (
              <button
                onClick={() => {
                  setSearch("");
                  setCurrentPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Grouped Project Sections */}
        <div className="min-h-[240px]">
          {isLoading ? (
            <div className="py-12 text-center text-slate-400 text-xs">Loading notes…</div>
          ) : loadError ? (
            <div className="py-12 text-center text-red-500 dark:text-red-400 text-xs">{loadError}</div>
          ) : paginatedGroups.length > 0 ? (
            paginatedGroups.map((group) => {
              const isExpanded = isGroupExpanded(group.projectId);
              return (
                <div key={group.projectId} className="border-b border-slate-200 dark:border-slate-800 last:border-b-0">
                  {/* Deliberately a <button>, not a link/navigation — this
                      only expands/collapses the group in place. PR No stays
                      plain text within it, never a hyperlink, and there is
                      no route/Project Workspace navigation anywhere here. */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.projectId)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-slate-50/60 dark:bg-slate-800/40 hover:bg-slate-100/70 dark:hover:bg-slate-800/70 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isExpanded ? (
                        <ChevronDown size={14} className="text-slate-400 shrink-0" />
                      ) : (
                        <ChevronRight size={14} className="text-slate-400 shrink-0" />
                      )}
                      <span className="font-bold text-slate-800 dark:text-slate-100 text-sm whitespace-nowrap">
                        {group.prNo || "—"}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-900/50 whitespace-nowrap shrink-0">
                        {group.notes.length} {group.notes.length === 1 ? "Note" : "Notes"}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 whitespace-nowrap shrink-0">
                      Latest activity: {formatNoteDateTime(group.latestActivityIso)}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="overflow-x-auto">
                      {/* table-fixed + explicit shared widths — without this,
                          a plain HTML table auto-sizes each column from ONLY
                          that group's own note text, so "Added By"/"Date"
                          landed at a different x-position in every group
                          (a short-note group's Note column shrinks, pulling
                          its other columns left). Fixed, identical
                          proportions on every group's table keep all
                          columns aligned down the whole page. */}
                      <table className="w-full text-left border-collapse table-fixed">
                        <thead>
                          <tr className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            <th className="py-2 px-4 pl-9 w-[55%]">NOTE / TEXT</th>
                            <th className="py-2 px-4 w-[20%] whitespace-nowrap">ADDED BY</th>
                            <th className="py-2 px-4 w-[25%] whitespace-nowrap text-right">DATE</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                          {group.notes.map((note) => {
                            const isLongNote = note.message.length > NOTE_PREVIEW_CHAR_LIMIT;
                            const isNoteExpanded = expandedNoteIds.has(note.id);
                            const displayText =
                              isLongNote && !isNoteExpanded
                                ? truncateNoteText(note.message, NOTE_PREVIEW_CHAR_LIMIT)
                                : note.message;
                            return (
                              <tr key={note.id}>
                                <td className="py-3 px-4 pl-9 text-slate-700 dark:text-slate-300">
                                  <span className="block max-w-2xl whitespace-pre-wrap break-words">{displayText}</span>
                                  {isLongNote && (
                                    <button
                                      type="button"
                                      onClick={() => toggleNoteExpanded(note.id)}
                                      className="mt-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                                    >
                                      {isNoteExpanded ? "Less" : "More"}
                                    </button>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-slate-600 dark:text-slate-400 font-medium whitespace-nowrap">
                                  {note.createdBy}
                                </td>
                                <td className="py-3 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap text-right">
                                  {formatNoteDateTime(note.createdAt)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="py-12 text-center text-slate-400 text-xs">
              {notes.length === 0 ? "No notes found for any project you have access to." : "No notes match your search."}
            </div>
          )}
        </div>

        {/* Footer Pagination — paginates whole project groups, never splits one group across pages. */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3 border-t border-slate-200 dark:border-slate-800 text-xs">
            <span className="text-slate-500">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                className="px-2.5 py-1 border border-slate-200 dark:border-slate-800 rounded-lg disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                className="px-2.5 py-1 border border-slate-200 dark:border-slate-800 rounded-lg disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
