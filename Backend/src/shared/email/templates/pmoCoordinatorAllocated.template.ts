import { EMAIL_BRAND, EMAIL_SUBJECTS } from "../email.constants.js";
import type { PmoCoordinatorAllocatedEmailData } from "../email.types.js";
import { renderButton, renderEmailLayout } from "./layout.template.js";

/** Project titles, client and person names are user-entered — escaped before going into the HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function row(label: string, value: string | null, borderTop = true): string {
  if (!value) return "";
  const border = borderTop ? "border-top:1px solid #E2E8F0;" : "";
  return `
      <tr>
        <td style="padding:12px 16px; font-size:13px; color:#64748B; ${border}">${label}</td>
        <td style="padding:12px 16px; font-size:13px; color:#0F172A; font-weight:600; ${border}">${escapeHtml(value)}</td>
      </tr>`;
}

/**
 * PMO Coordinator Management (Oct 2026) — sent to the coordinator's linked
 * PMO Portal account when they become a project's PMO Coordinator. Project
 * identification only: no financial data, no credentials.
 */
export function buildPmoCoordinatorAllocatedEmail(data: PmoCoordinatorAllocatedEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const greeting = data.coordinatorName ? `Hello ${data.coordinatorName},` : "Hello,";
  const statement = `You have been assigned as the PMO Coordinator for the project below.`;

  const bodyHtml = `
    <p style="margin:0 0 16px;">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 16px;">${statement}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin:16px 0; border:1px solid #E2E8F0; border-radius:8px;">
      ${row("Project No.", data.prNo, false)}
      ${row("Project Name", data.projectTitle)}
      ${row("Client", data.client)}
    </table>

    ${renderButton(data.projectUrl, "Open Project")}
  `;

  const text = [
    greeting,
    "",
    statement,
    "",
    `Project No.: ${data.prNo}`,
    `Project Name: ${data.projectTitle}`,
    ...(data.client ? [`Client: ${data.client}`] : []),
    "",
    `Open the project: ${data.projectUrl}`,
    "",
    `${EMAIL_BRAND.COMPANY_NAME} ${EMAIL_BRAND.PORTAL_NAME}`,
  ].join("\n");

  return {
    subject: EMAIL_SUBJECTS.PMO_COORDINATOR_ALLOCATED(data.prNo),
    html: renderEmailLayout({
      bodyHtml,
      previewText: `You have been assigned as PMO Coordinator for ${data.prNo}.`,
    }),
    text,
  };
}
