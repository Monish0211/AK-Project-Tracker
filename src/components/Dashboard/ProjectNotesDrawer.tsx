import { useState, useEffect, useRef } from "react";
import { X, BookOpen, MessageSquarePlus } from "lucide-react";
import type { Project } from "../../types/Project";
import type { ProjectNote } from "../../types/ProjectNote";
import { ProjectNoteCard } from "../Cards/ProjectNoteCard";
import { groupNotesByDate } from "../../services/ProjectNotesService";
import { updateProject } from "../../services/projectService";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  setProject: (project: Project) => void;
  readOnly?: boolean;
}

export const ProjectNotesDrawer = ({ isOpen, onClose, project, setProject, readOnly = false }: Props) => {
  const [noteText, setNoteText] = useState("");
  const [characterCount, setCharacterCount] = useState(0);
  const [animateShow, setAnimateShow] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Synchronize internal state with drawer opening animation
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => setAnimateShow(true), 50);
    } else {
      setAnimateShow(false);
    }
  }, [isOpen]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNoteText(val);
    setCharacterCount(val.length);
  };

  const handleSaveNote = () => {
    if (noteText.trim() === "") return;

    const newNote: ProjectNote = {
      id: Math.random().toString(36).substr(2, 9),
      projectId: project.id,
      message: noteText.trim(),
      createdBy: "Administrator",
      createdAt: new Date().toISOString(),
    };

    const updatedNotes = [newNote, ...(project.notes || [])];
    const updatedProject = { ...project, notes: updatedNotes };

    // Update state instantly
    setProject(updatedProject);

    // Persist to localStorage directly
    updateProject(updatedProject);

    // Reset composer input
    setNoteText("");
    setCharacterCount(0);
  };

  const groupedNotes = groupNotesByDate(project.notes || []);
  const groupKeys = Object.keys(groupedNotes);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      
      {/* Backdrop overlay */}
      <div
        className={`absolute inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          animateShow ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className="absolute inset-y-0 right-0 pl-10 max-w-full flex">
        <div
          className={`w-screen md:w-[420px] sm:w-[380px] bg-slate-50 dark:bg-[#0F172A] border-l border-gray-200 dark:border-slate-800 shadow-2xl flex flex-col h-full transform transition-transform duration-300 ease-in-out ${
            animateShow ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {/* Header */}
          <div className="pl-6 pr-6 py-5 border-b border-gray-200 dark:border-[#334155]/60 flex justify-between items-start bg-white dark:bg-[#1E293B] flex-shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">📝</span>
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                  Project Notes
                </h2>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide border border-blue-100 dark:border-blue-800/30">
                  {project.prNo || "PR-XXXXX"}
                </span>
                <span className="text-xs text-[#64748B] dark:text-[#94A3B8] font-medium">
                  Track project updates & notes.
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-[#64748B] dark:text-[#94A3B8] hover:bg-[#F1F5F9] dark:hover:bg-[#334155] hover:text-[#0F172A] dark:hover:text-[#FFFFFF] transition"
            >
              <X size={20} />
            </button>
          </div>

          {/* Composer */}
          {!readOnly && (
            <div className="p-6 bg-white dark:bg-[#1E293B] border-b border-gray-200 dark:border-[#334155]/60 flex flex-col gap-3 flex-shrink-0 shadow-sm">
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  value={noteText}
                  onChange={handleTextChange}
                  rows={4}
                  maxLength={1000}
                  placeholder="Write a project update...&#10;&#10;Example:&#10;• Client requested revised submission.&#10;• Invoice sent for approval.&#10;• Payment milestone updated.&#10;• Meeting completed."
                  className="w-full rounded-xl border border-gray-200 dark:border-[#334155] bg-slate-50 dark:bg-[#0B0F19]/60 p-4 pb-10 text-sm text-slate-800 dark:text-slate-200 placeholder-[#94A3B8] dark:placeholder-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 focus:outline-none transition resize-none leading-relaxed"
                />
                <span
                  className={`absolute bottom-3 right-4 text-[11px] font-medium rounded-full px-2 py-1 border transition-all duration-200 ease bg-[#F3F4F6] border-[#E5E7EB] dark:bg-[rgba(255,255,255,0.08)] dark:border-[rgba(255,255,255,0.08)] ${
                    characterCount >= 900
                      ? "text-red-500 border-red-500/35 dark:text-red-400 dark:border-red-500/30"
                      : characterCount >= 700
                      ? "text-amber-500 border-amber-500/35 dark:text-amber-400 dark:border-amber-500/30"
                      : "text-[#64748B] dark:text-[#94A3B8]"
                  }`}
                >
                  {characterCount}/1000
                </span>
              </div>
              
              <button
                onClick={handleSaveNote}
                disabled={noteText.trim() === ""}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-[#64748B] text-white font-semibold py-2.5 px-4 rounded-xl shadow-sm hover:shadow-md transition duration-200 disabled:cursor-not-allowed text-sm"
              >
                <MessageSquarePlus size={16} />
                Save Note
              </button>
            </div>
          )}

          {/* Notes Scroll Timeline */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar-timeline bg-transparent">
            {groupKeys.length === 0 ? (
              /* Empty State */
              <div className="h-full flex flex-col items-center justify-center text-center p-4">
                <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4 animate-pulse">
                  <BookOpen size={32} strokeWidth={1.5} />
                </div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  No Project Notes Yet
                </h3>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1 max-w-[240px] leading-relaxed">
                  Project updates will appear here once someone saves a note.
                </p>
              </div>
            ) : (
              /* Timeline Items */
              <div className="space-y-6">
                {groupKeys.map((groupKey) => (
                  <div key={groupKey} className="space-y-2">
                    
                    {/* Date grouping separator */}
                    <div className="flex items-center gap-4 my-4">
                      <div className="flex-1 border-t border-gray-200/50 dark:border-[#334155]/60" />
                      <span className="text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-widest bg-transparent px-2">
                        {groupKey}
                      </span>
                      <div className="flex-1 border-t border-gray-200/50 dark:border-[#334155]/60" />
                    </div>

                    {/* Single timeline rounded container (No individual dark cards) */}
                    <div className="bg-white dark:bg-[#1E293B] border border-gray-200/60 dark:border-[#334155]/80 rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-[#334155]/60 shadow-sm">
                      {groupedNotes[groupKey].map((note) => (
                        <ProjectNoteCard key={note.id} note={note} />
                      ))}
                    </div>

                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

    </div>
  );
};
export default ProjectNotesDrawer;
