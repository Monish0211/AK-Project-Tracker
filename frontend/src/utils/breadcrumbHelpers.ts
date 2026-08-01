import { matchPath } from "react-router-dom";
import {
  LayoutDashboard, FolderKanban, FolderPlus, PencilLine, Eye,
  Building2, Users, Clock3, Wallet, BarChart3, Settings,
  CreditCard, FileText, Briefcase
} from "lucide-react";
import type { BreadcrumbItem } from "../types/BreadcrumbItem";
import { getProjectById } from "../services/projectService";

export const getBreadcrumbs = (pathname: string): BreadcrumbItem[] => {
  // Check projects edit
  const editMatch = matchPath("/projects/edit/:id", pathname);
  if (editMatch) {
    const id = editMatch.params.id;
    const project = id ? getProjectById(id) : undefined;
    const prNoLabel = project ? project.prNo : "Loading...";
    return [
      { label: "Dashboard", icon: LayoutDashboard, href: "/", clickable: true },
      { label: "Projects", icon: FolderKanban, href: "/projects", clickable: true },
      { label: prNoLabel, icon: Briefcase, href: `/projects/view/${id}`, clickable: !!project },
      { label: "Edit", icon: PencilLine, clickable: false, current: true }
    ];
  }

  // Check projects view
  const viewMatch = matchPath("/projects/view/:id", pathname);
  if (viewMatch) {
    const id = viewMatch.params.id;
    const project = id ? getProjectById(id) : undefined;
    const prNoLabel = project ? project.prNo : "Loading...";
    
    // Read from session storage to determine current subpage/tab
    const activeTab = sessionStorage.getItem("view-project-tab") || "general";
    const isNotesOpen = sessionStorage.getItem("view-project-notes") === "true";
    
    let subLabel = "View";
    let subIcon = Eye;
    
    if (isNotesOpen) {
      subLabel = "Notes";
      subIcon = FileText;
    } else if (activeTab === "invoices") {
      subLabel = "Invoices";
      subIcon = CreditCard;
    } else if (activeTab === "expenses") {
      subLabel = "Expenses";
      subIcon = Wallet;
    }

    return [
      { label: "Dashboard", icon: LayoutDashboard, href: "/", clickable: true },
      { label: "Projects", icon: FolderKanban, href: "/projects", clickable: true },
      { label: prNoLabel, icon: Briefcase, href: `/projects/view/${id}`, clickable: !!project },
      { label: subLabel, icon: subIcon, clickable: false, current: true }
    ];
  }

  // Add Project
  const addMatch = matchPath("/projects/add", pathname);
  if (addMatch) {
    return [
      { label: "Dashboard", icon: LayoutDashboard, href: "/", clickable: true },
      { label: "Projects", icon: FolderKanban, href: "/projects", clickable: true },
      { label: "Add Project", icon: FolderPlus, clickable: false, current: true }
    ];
  }

  // Standard static routes map
  const rules = [
    { path: "/projects", items: [
      { label: "Dashboard", icon: LayoutDashboard, href: "/", clickable: true },
      { label: "Projects", icon: FolderKanban, clickable: false }
    ]},
    { path: "/customers", items: [
      { label: "Dashboard", icon: LayoutDashboard, href: "/", clickable: true },
      { label: "Customer Master", icon: Building2, clickable: false }
    ]},
    { path: "/manpower", items: [
      { label: "Dashboard", icon: LayoutDashboard, href: "/", clickable: true },
      { label: "Manpower", icon: Users, clickable: false }
    ]},
    { path: "/timesheets", items: [
      { label: "Dashboard", icon: LayoutDashboard, href: "/", clickable: true },
      { label: "Timesheets", icon: Clock3, clickable: false }
    ]},
    { path: "/reports", items: [
      { label: "Dashboard", icon: LayoutDashboard, href: "/", clickable: true },
      { label: "Reports", icon: BarChart3, clickable: false }
    ]},
    { path: "/settings", items: [
      { label: "Dashboard", icon: LayoutDashboard, href: "/", clickable: true },
      { label: "Settings", icon: Settings, clickable: false }
    ]},
    { path: "/dashboard", items: [
      { label: "Dashboard", icon: LayoutDashboard, clickable: false }
    ]},
    { path: "/", items: [
      { label: "Dashboard", icon: LayoutDashboard, clickable: false }
    ]}
  ];

  for (const rule of rules) {
    if (matchPath(rule.path, pathname)) {
      return rule.items.map((item, idx) => ({
        ...item,
        current: idx === rule.items.length - 1
      }));
    }
  }

  return [
    { label: "Dashboard", icon: LayoutDashboard, href: "/", clickable: true },
    { label: "PMO Portal", icon: LayoutDashboard, clickable: false, current: true }
  ];
};
