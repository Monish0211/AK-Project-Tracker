import {
  FileText,
  Wallet,
  Users,
  TriangleAlert,
  ClipboardCheck,
  Package,
  Clock,
  ScrollText,
  Flag,
  Bell,
} from "lucide-react";

interface Props {
  /** A reminder's free-text type (Invoice, Client Meeting, ...). */
  type: string;
  size?: number;
  className?: string;
}

/**
 * Maps a reminder's free-text type to a consistent Lucide icon.
 * Each branch renders a statically-imported icon directly (no intermediate
 * component-valued variable) so icon selection stays stable across renders.
 */
export const ReminderTypeIcon = ({ type, size = 14, className }: Props) => {
  if (/invoice/i.test(type)) return <FileText size={size} className={className} />;
  if (/payment|budget/i.test(type)) return <Wallet size={size} className={className} />;
  if (/meeting/i.test(type)) return <Users size={size} className={className} />;
  if (/deadline/i.test(type)) return <TriangleAlert size={size} className={className} />;
  if (/deliverable|document|submission/i.test(type)) return <ClipboardCheck size={size} className={className} />;
  if (/procurement/i.test(type)) return <Package size={size} className={className} />;
  if (/timesheet/i.test(type)) return <Clock size={size} className={className} />;
  if (/contract/i.test(type)) return <ScrollText size={size} className={className} />;
  if (/milestone/i.test(type)) return <Flag size={size} className={className} />;
  return <Bell size={size} className={className} />;
};
