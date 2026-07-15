import type { ProjectNote } from "../types/ProjectNote";

export const groupNotesByDate = (notes: ProjectNote[]): { [key: string]: ProjectNote[] } => {
  const groups: { [key: string]: ProjectNote[] } = {};
  
  // Sort notes: newest first (descending timestamp)
  const sortedNotes = [...notes].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  sortedNotes.forEach((note) => {
    const date = new Date(note.createdAt);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    
    let groupKey = "";
    if (date.toDateString() === today.toDateString()) {
      groupKey = "Today";
    } else if (date.toDateString() === yesterday.toDateString()) {
      groupKey = "Yesterday";
    } else {
      groupKey = date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }); // e.g. "15 Jul 2026"
    }
    
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(note);
  });
  
  return groups;
};

export const formatNoteTime = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }); // e.g. "10:42 AM"
};
