import type { ProjectNote } from "../../types/ProjectNote";
import { User, Clock } from "lucide-react";
import { formatNoteTime } from "../../services/ProjectNotesService";

interface Props {
  note: ProjectNote;
}

export const ProjectNoteCard = ({ note }: Props) => {
  return (
    <div className="p-5 bg-transparent hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors duration-150 animate-fade-in-up">
      
      {/* Header Row: Avatar, Name, Time */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {/* Neutral Avatar */}
          <div className="w-6 h-6 rounded-full bg-[#F1F5F9] dark:bg-[#334155] flex items-center justify-center border border-[#E2E8F0] dark:border-[#475569]/40 shrink-0">
            <User size={12} className="text-[#64748B] dark:text-[#94A3B8]" />
          </div>
          <span className="text-[15px] font-semibold text-[#0F172A] dark:text-[#FFFFFF]">
            {note.createdBy}
          </span>
        </div>
        
        {/* Muted Time Badge */}
        <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#64748B] dark:text-[#94A3B8] shrink-0">
          <Clock size={12} className="text-[#64748B] dark:text-[#94A3B8]" />
          <span>{formatNoteTime(note.createdAt)}</span>
        </div>
      </div>
      
      {/* Message Row */}
      <div className="pl-8">
        <p className="text-[15px] font-medium text-[#334155] dark:text-[#F1F5F9] leading-relaxed whitespace-pre-wrap">
          {note.message}
        </p>
      </div>
      
    </div>
  );
};
export default ProjectNoteCard;