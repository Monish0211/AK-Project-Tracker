import { EMAIL_BRAND } from "../email.constants.js";
import { renderEmailLayout } from "./layout.template.js";

/** Project, client and manager names are user-entered — always escaped before going into the HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface MissingExpenseEmailProject {
  prNo: string;
  client: string;
  projectTitle: string;
  projectManager: string | null;
  projectStatus: string;
  /** Built from the configured FRONTEND_URL, never from a request header. */
  projectUrl: string;
}

export interface MissingExpenseEmailData {
  subject: string;
  generatedAt: string; // already formatted, includes the timezone
  eligibleCount: number;
  projects: MissingExpenseEmailProject[];
}

const SCOPE_NOTE =
  "This check covers Other Project Expenses only (records in the Other Project Expenses section). It does not assess man-hour expenses, Expense Budget, timesheets or invoices.";

const cell = "padding:8px 10px; font-size:12.5px; border-top:1px solid #E2E8F0; vertical-align:top;";
const head = "padding:8px 10px; font-size:11.5px; color:#475569; text-align:left; background-color:#F1F5F9; font-weight:700;";

/** Weekly "Projects Missing Other Project Expenses" report (Oct 2026) — HTML + plain-text alternative. */
export function buildMissingOtherExpensesEmail(data: MissingExpenseEmailData): { subject: string; html: string; text: string } {
  const count = data.projects.length;
  const summaryHtml = `
    <p style="margin:0 0 6px;">Weekly report generated <strong>${escapeHtml(data.generatedAt)}</strong>.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px 0 16px; border:1px solid #E2E8F0; border-radius:8px; width:100%;">
      <tr>
        <td style="padding:10px 14px; font-size:13px; color:#64748B;">Eligible projects checked</td>
        <td style="padding:10px 14px; font-size:13px; color:#0F172A; font-weight:700; text-align:right;">${data.eligibleCount}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px; font-size:13px; color:#64748B; border-top:1px solid #E2E8F0;">Projects missing Non-Man-Hour Expenses</td>
        <td style="padding:10px 14px; font-size:13px; color:#B45309; font-weight:700; text-align:right; border-top:1px solid #E2E8F0;">${count}</td>
      </tr>
    </table>`;

  const tableHtml =
    count === 0
      ? `<p style="margin:16px 0; padding:12px 14px; background-color:#F0FDF4; border:1px solid #BBF7D0; border-radius:8px; color:#166534;">
           Every eligible project has at least one Other Project Expenses record. No action is needed.
         </p>`
      : `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; border:1px solid #E2E8F0; border-radius:8px; border-collapse:separate;">
           <tr>
             <th style="${head}">PR No.</th>
             <th style="${head}">Client</th>
             <th style="${head}">Project Title</th>
             <th style="${head}">Project Manager</th>
             <th style="${head}">Status</th>
             <th style="${head}">Link</th>
           </tr>
           ${data.projects
             .map(
               (p) => `
           <tr>
             <td style="${cell} font-weight:700; white-space:nowrap;">${escapeHtml(p.prNo)}</td>
             <td style="${cell}">${escapeHtml(p.client)}</td>
             <td style="${cell}">${escapeHtml(p.projectTitle)}</td>
             <td style="${cell}">${escapeHtml(p.projectManager || "—")}</td>
             <td style="${cell} white-space:nowrap;">${escapeHtml(p.projectStatus || "—")}</td>
             <td style="${cell} white-space:nowrap;"><a href="${escapeHtml(p.projectUrl)}" target="_blank" style="color:#2563EB; font-weight:600;">Open</a></td>
           </tr>`
             )
             .join("")}
         </table>`;

  const bodyHtml = `
    <p style="margin:0 0 12px; font-size:16px; font-weight:700; color:#0F172A;">Projects Missing Other Project Expenses</p>
    ${summaryHtml}
    ${tableHtml}
    <p style="margin:16px 0 0; font-size:12px; color:#64748B;">${SCOPE_NOTE}</p>
    <p style="margin:8px 0 0; font-size:12px; color:#64748B;">Excluded statuses: Not Started, On Hold, Completed, Cancelled. Archived projects are not included.</p>
  `;

  const text = [
    "Projects Missing Other Project Expenses",
    "",
    `Generated: ${data.generatedAt}`,
    `Eligible projects checked: ${data.eligibleCount}`,
    `Projects missing Non-Man-Hour Expenses: ${count}`,
    "",
    ...(count === 0
      ? ["Every eligible project has at least one Other Project Expenses record. No action is needed."]
      : data.projects.map(
          (p) => `- ${p.prNo} | ${p.client} | ${p.projectTitle} | PM: ${p.projectManager || "—"} | ${p.projectStatus || "—"} | ${p.projectUrl}`
        )),
    "",
    SCOPE_NOTE,
    "Excluded statuses: Not Started, On Hold, Completed, Cancelled. Archived projects are not included.",
    "",
    `${EMAIL_BRAND.COMPANY_NAME} ${EMAIL_BRAND.PORTAL_NAME}`,
  ].join("\n");

  return {
    subject: data.subject,
    html: renderEmailLayout({
      bodyHtml,
      previewText: `${count} project(s) missing Other Project Expenses out of ${data.eligibleCount} checked.`,
      maxWidthPx: 760,
    }),
    text,
  };
}
