import type { LucideIcon } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  icon: LucideIcon;
  href?: string;
  clickable: boolean;
  current?: boolean;
}
