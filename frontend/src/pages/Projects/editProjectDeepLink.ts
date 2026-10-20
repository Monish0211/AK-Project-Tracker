import type { TabKey } from "./components/ProjectForm";

/** Edit Project's seven section keys (same order as ProjectForm's TABS_EDIT). */
export const EDIT_PROJECT_TABS: readonly TabKey[] = ["general", "quantity", "payments", "budget", "team", "expenses", "invoices"];

export interface EditProjectDeepLink {
  tab?: TabKey;
  activityId?: string;
  invoiceLineId?: string;
}

/**
 * Which Edit Project section to open (and which invoice to highlight).
 * In-app navigation passes it in route state; links from outside the app —
 * the weekly emails (Oct 2026) — can't carry state, so they use
 * `?tab=expenses` / `?tab=invoices&invoiceLineId=…`. The query stays in the
 * URL, so a refresh reopens the same section. Route state wins when both are
 * present; an unknown tab is ignored (General opens), and an unknown line id
 * simply highlights nothing. Only chooses what is shown first — every
 * permission check (Projects module, project access, Invoices module for
 * invoice data) still applies as usual.
 */
export function readEditProjectDeepLink(state: unknown, search: string): EditProjectDeepLink {
  const s = (state && typeof state === "object" ? state : {}) as EditProjectDeepLink;
  const q = new URLSearchParams(search);
  const rawTab = s.tab ?? q.get("tab") ?? undefined;
  const tab = rawTab && (EDIT_PROJECT_TABS as readonly string[]).includes(rawTab) ? (rawTab as TabKey) : undefined;
  const invoiceLineId = s.invoiceLineId ?? q.get("invoiceLineId") ?? undefined;
  return {
    ...(tab ? { tab } : {}),
    ...(s.activityId ? { activityId: s.activityId } : {}),
    ...(invoiceLineId ? { invoiceLineId } : {}),
  };
}
