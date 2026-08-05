import React, { useState, useEffect, useRef } from "react";
import { X, BookOpen, MessageSquarePlus, Bell, Plus } from "lucide-react";
import type { Project } from "../../types/Project";
import type { ProjectNote } from "../../types/ProjectNote";
import type { ProjectReminder } from "../../types/ProjectReminder";
import { ProjectNoteCard } from "../Cards/ProjectNoteCard";
import { groupNotesByDate } from "../../services/ProjectNotesService";
import { updateProject, getProjectById } from "../../services/projectService";
import { reminderService } from "../../services/reminders/ReminderService";
import { ReminderCard } from "../Cards/ReminderCard";
import { ReminderForm } from "../../pages/Projects/components/workspace/ReminderForm";
import { EmptyState } from "../ui/EmptyState";
import { Button } from "../ui/Button";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  setProject: (project: Project) => void;
  readOnly?: boolean;
}

export const ProjectWorkspaceDrawer = ({ isOpen, onClose, project, setProject, readOnly = false }: Props) => {
  const [activeTab, setActiveTab] = useState<"notes" | "reminders">("notes");
  
  // Notes State
  const [noteText, setNoteText] = useState("");
  const [characterCount, setCharacterCount] = useState(0);
  
  // Reminders State
  const [reminders, setReminders] = useState<ProjectReminder[]>([]);
  const [isEditingReminder, setIsEditingReminder] = useState(false);
  const [editingReminder, setEditingReminder] = useState<ProjectReminder | null>(null);

  const [animateShow, setAnimateShow] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Synchronize internal state with drawer opening animation
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => setAnimateShow(true), 50);
      loadReminders();
    } else {
      setAnimateShow(false);
      setIsEditingReminder(false);
      setEditingReminder(null);
    }
  }, [isOpen, project.id]);

  useEffect(() => {
    const handleDataChange = () => {
      loadReminders();
      const latest = getProjectById(project.id);
      if (latest) {
        setProject(latest);
      }
    };
    window.addEventListener("pmo:reminders-changed", handleDataChange);
    window.addEventListener("pmo:data-changed", handleDataChange);
    window.addEventListener("pmo:project-completed", handleDataChange);
    return () => {
      window.removeEventListener("pmo:reminders-changed", handleDataChange);
      window.removeEventListener("pmo:data-changed", handleDataChange);
      window.removeEventListener("pmo:project-completed", handleDataChange);
    };
  }, [project.id, setProject]);

  const loadReminders = () => {
    setReminders(reminderService.getRemindersByProject(project.id));
  };

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

  const handleSaveReminder = (reminderData: Partial<ProjectReminder>) => {
    if (editingReminder) {
      reminderService.updateReminder(editingReminder.id, reminderData);
    } else {
      reminderService.addReminder(reminderData as any);
    }
    setIsEditingReminder(false);
    setEditingReminder(null);
  };

  const handleEditReminder = (reminder: ProjectReminder) => {
    setEditingReminder(reminder);
    setIsEditingReminder(true);
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

      {/* Drawer / Dialog Panel */}
      <div className={`absolute inset-y-0 right-0 pl-10 max-w-full flex ${isEditingReminder ? "items-center pr-2 sm:pr-4" : ""}`}>
        <div
          className={`w-screen md:w-[440px] sm:w-[400px] bg-slate-50 dark:bg-[#0F172A] border border-gray-200 dark:border-slate-800 shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out ${
            isEditingReminder
              ? "h-auto max-h-[90vh] rounded-2xl overflow-hidden shadow-2xl"
              : "h-full rounded-l-2xl border-y-0 border-r-0"
          } ${
            animateShow ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {isEditingReminder ? (
            <ReminderForm 
              reminder={editingReminder} 
              projectId={project.id}
              projectCode={project.prNo || "PR-XXXXX"}
              onSave={handleSaveReminder}
              onCancel={() => { setIsEditingReminder(false); setEditingReminder(null); }}
            />
          ) : (
            <>
              {/* Header */}
              <div className="pl-6 pr-6 py-5 border-b border-gray-200 dark:border-[#334155]/60 flex flex-col bg-white dark:bg-[#1E293B] flex-shrink-0">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      <BookOpen size={20} className="text-blue-500" />
                      Project Workspace
                    </h2>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide border border-blue-100 dark:border-blue-800/30">
                        {project.prNo || "PR-XXXXX"}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={onClose}
                      className="p-1.5 text-[#64748B] hover:text-[#0F172A] dark:text-[#94A3B8] dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                      title="Close drawer"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex bg-slate-100 dark:bg-slate-800/90 rounded-lg p-1 border border-slate-200/60 dark:border-slate-700/60">
                  <button
                    type="button"
                    onClick={() => setActiveTab("notes")}
                    className={`flex-1 py-1.5 text-sm font-semibold rounded-md transition-all duration-150 flex items-center justify-center gap-2 ${
                      activeTab === "notes"
                        ? "bg-blue-600 text-white shadow-sm font-bold"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100 dark:hover:text-slate-100 hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
                    }`}
                  >
                    📝 Notes
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("reminders")}
                    className={`flex-1 py-1.5 text-sm font-semibold rounded-md transition-all duration-150 flex items-center justify-center gap-2 ${
                      activeTab === "reminders"
                        ? "bg-blue-600 text-white shadow-sm font-bold"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100 dark:hover:text-slate-100 hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
                    }`}
                  >
                    🔔 Reminders
                    {reminders.filter((r) => r.status === "Pending").length > 0 && (
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full transition-colors ${
                          activeTab === "reminders" ? "bg-white/25 text-white" : "bg-red-500 text-white"
                        }`}
                      >
                        {reminders.filter((r) => r.status === "Pending").length}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Tab Content */}
              {activeTab === "notes" ? (
                <>
                  {/* Notes Composer */}
                  {!readOnly && (
                    <div className="p-4 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-[#1E293B] shrink-0">
                      <div className="relative">
                        <textarea
                          ref={textareaRef}
                          value={noteText}
                          onChange={handleTextChange}
                          placeholder="Type a new project note here..."
                          className="w-full bg-slate-50 dark:bg-[#0F172A] border border-gray-200 dark:border-slate-700 rounded-xl p-3 pr-10 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none min-h-[90px] custom-scrollbar transition-all shadow-sm"
                        />
                        <Button
                          variant="primary"
                          size="icon"
                          onClick={handleSaveNote}
                          disabled={noteText.trim() === ""}
                          title="Save Note"
                          className="absolute bottom-3 right-3 !bg-blue-600 hover:!bg-blue-700 active:!bg-blue-800 !text-white disabled:!bg-blue-400/50 disabled:dark:!bg-blue-900/40 disabled:!text-white/60 disabled:cursor-not-allowed shadow-sm transition-all rounded-lg"
                          icon={<MessageSquarePlus size={16} />}
                        />
                      </div>
                      <div className="flex justify-between items-center mt-2 px-1">
                        <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                          {characterCount > 0 ? `${characterCount} characters` : "Notes are permanent."}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Notes Feed */}
                  <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-[#0F172A] p-4 custom-scrollbar-timeline">
                    {groupKeys.length > 0 ? (
                      <div className="space-y-6">
                        {groupKeys.map((dateString) => (
                          <div key={dateString} className="relative">
                            <div className="flex items-center gap-4 my-4">
                              <div className="flex-1 border-t border-gray-200/50 dark:border-[#334155]/60" />
                              <span className="text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-widest bg-transparent px-2">
                                {dateString}
                              </span>
                              <div className="flex-1 border-t border-gray-200/50 dark:border-[#334155]/60" />
                            </div>

                            <div className="bg-white dark:bg-[#1E293B] border border-gray-200/60 dark:border-[#334155]/80 rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-[#334155]/60 shadow-sm">
                              {groupedNotes[dateString].map((note) => (
                                <ProjectNoteCard key={note.id} note={note} />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 space-y-3 px-6 text-center">
                        <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4">
                          <BookOpen size={32} strokeWidth={1.5} />
                        </div>
                        <p className="text-sm font-medium">No Project Notes Yet</p>
                        {!readOnly && (
                          <p className="text-xs max-w-[240px]">
                            Write the first note to document important project updates.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* Reminders Header */}
                  {!readOnly && (
                    <div className="p-4 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-[#1E293B] shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsEditingReminder(true)}
                        className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-sm rounded-xl shadow-sm transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Plus size={18} strokeWidth={2.5} />
                        Add Reminder
                      </button>
                    </div>
                  )}

                  {/* Reminders List */}
                  <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-[#0F172A] p-4 custom-scrollbar">
                    {reminders.length > 0 ? (
                      <div className="space-y-3">
                        {reminders.sort((a,b) => {
                          if (a.status !== b.status) return a.status === 'Pending' ? -1 : 1;
                          return new Date(a.reminderDate).getTime() - new Date(b.reminderDate).getTime()
                        }).map(reminder => (
                          <ReminderCard 
                            key={reminder.id} 
                            reminder={reminder} 
                            onEdit={handleEditReminder} 
                            readOnly={readOnly}
                          />
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        icon={<Bell size={20} strokeWidth={1.5} />}
                        title="No reminders yet"
                        description={
                          readOnly
                            ? "This project has no reminders."
                            : "Create reminders for invoices, deliverables, meetings, or project milestones."
                        }
                      />
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
export default ProjectWorkspaceDrawer;
