import { EMAIL_BRAND } from "../email.constants.js";
import { renderEmailLayout } from "./layout.template.js";
import { escapeHtml } from "./missingOtherExpenses.template.js";

export interface UnpaidInvoiceEmailRow {
  prNo: string;
  client: string;
  projectTitle: string;
  projectManager: string | null;
  invoiceNo: string;
  invoiceDate: string; // YYYY-MM-DD
  daysSinceRaised: number;
  invoiceAmountINR: number;
  amountPaidINR: number | null;
  outstandingINR: number | null;
  status: "Raised / Submitted" | "Partially Paid";
  originalAmountNote: string | null;
  /** Built from the configured FRONTEND_URL, never from a request header. */
  projectUrl: string;
}

export interface UnpaidInvoiceEmailData {
  subject: string;
  generatedAt: string; // already formatted, includes the timezone
  eligibleCount: number;
  overdueDays: number;
  knownOutstandingINR: number;
  partiallyPaidCount: number;
  rows: UnpaidInvoiceEmailRow[];
}

const NOT_RECORDED = "Not recorded";

// One formatter for the whole email: value.toLocaleString("en-IN", {...}) builds a new
// Intl.NumberFormat on every call, which dominated rendering of large reminders.
// Same locale and options, so the output is identical.
const INR_FORMAT = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatINR(value: number): string {
  return `₹ ${INR_FORMAT.format(value)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-01" → "01 Sep 2026" — fixed format, independent of the server's ICU/locale data. */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d} ${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

const cell = "padding:7px 8px; font-size:12px; border-top:1px solid #E2E8F0; vertical-align:top;";
const head = "padding:7px 8px; font-size:11px; color:#475569; text-align:left; background-color:#F1F5F9; font-weight:700; white-space:nowrap;";

/** Weekly "Invoices Unpaid for 30+ Days" reminder (Oct 2026) — HTML + plain-text alternative. */
export function buildUnpaidInvoicesEmail(data: UnpaidInvoiceEmailData): { subject: string; html: string; text: string } {
  const count = data.rows.length;
  const scope =
    `Invoices in Raised / Submitted or Partially Paid status whose invoice date is at least ${data.overdueDays} calendar days old (the invoice's age, not how long it has been in its current status). ` +
    "Partially Paid invoices have no recorded paid amount in the portal, so their Amount Paid and Outstanding are shown as \"Not recorded\". " +
    "Paid, Cancelled and Draft invoices are not included.";

  const summaryRow = (label: string, value: string, color = "#0F172A", border = true) => `
      <tr>
        <td style="padding:9px 14px; font-size:13px; color:#64748B;${border ? " border-top:1px solid #E2E8F0;" : ""}">${label}</td>
        <td style="padding:9px 14px; font-size:13px; color:${color}; font-weight:700; text-align:right;${border ? " border-top:1px solid #E2E8F0;" : ""}">${value}</td>
      </tr>`;

  const summaryHtml = `
    <p style="margin:0 0 6px;">Weekly reminder generated <strong>${escapeHtml(data.generatedAt)}</strong>.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px 0 16px; border:1px solid #E2E8F0; border-radius:8px; width:100%;">
      ${summaryRow("Raised / Submitted and Partially Paid invoices checked", String(data.eligibleCount), "#0F172A", false)}
      ${summaryRow(`Invoices unpaid for ${data.overdueDays}+ days`, String(count), "#B91C1C")}
      ${summaryRow("Outstanding on fully unpaid (Raised / Submitted) invoices", escapeHtml(formatINR(data.knownOutstandingINR)))}
      ${data.partiallyPaidCount > 0 ? summaryRow("Partially Paid invoices (outstanding not recorded)", String(data.partiallyPaidCount), "#B45309") : ""}
    </table>`;

  const money = (v: number | null) => (v === null ? `<span style="color:#94A3B8;">${NOT_RECORDED}</span>` : escapeHtml(formatINR(v)));
  const tableHtml =
    count === 0
      ? `<p style="margin:16px 0; padding:12px 14px; background-color:#F0FDF4; border:1px solid #BBF7D0; border-radius:8px; color:#166534;">
           No invoice has been unpaid for ${data.overdueDays} days or more. No action is needed.
         </p>`
      : `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; border:1px solid #E2E8F0; border-radius:8px; border-collapse:separate;">
           <tr>
             <th style="${head}">PR No.</th>
             <th style="${head}">Client</th>
             <th style="${head}">Project Title</th>
             <th style="${head}">Invoice No.</th>
             <th style="${head}">Invoice Date</th>
             <th style="${head} text-align:right;">Days</th>
             <th style="${head} text-align:right;">Invoice Amount</th>
             <th style="${head} text-align:right;">Amount Paid</th>
             <th style="${head} text-align:right;">Outstanding</th>
             <th style="${head}">Status</th>
             <th style="${head}">Project Manager</th>
             <th style="${head}">Link</th>
           </tr>
           ${data.rows
             .map(
               (r) => `
           <tr>
             <td style="${cell} font-weight:700; white-space:nowrap;">${escapeHtml(r.prNo)}</td>
             <td style="${cell}">${escapeHtml(r.client)}</td>
             <td style="${cell}">${escapeHtml(r.projectTitle)}</td>
             <td style="${cell} white-space:nowrap;">${escapeHtml(r.invoiceNo)}</td>
             <td style="${cell} white-space:nowrap;">${escapeHtml(formatDate(r.invoiceDate))}</td>
             <td style="${cell} text-align:right; font-weight:700;">${r.daysSinceRaised}</td>
             <td style="${cell} text-align:right; white-space:nowrap;">${escapeHtml(formatINR(r.invoiceAmountINR))}${r.originalAmountNote ? `<br><span style="color:#64748B; font-size:11px;">${escapeHtml(r.originalAmountNote)}</span>` : ""}</td>
             <td style="${cell} text-align:right; white-space:nowrap;">${money(r.amountPaidINR)}</td>
             <td style="${cell} text-align:right; white-space:nowrap; font-weight:700;">${money(r.outstandingINR)}</td>
             <td style="${cell} white-space:nowrap; color:${r.status === "Partially Paid" ? "#B45309" : "#B91C1C"};">${escapeHtml(r.status)}</td>
             <td style="${cell}">${escapeHtml(r.projectManager || "—")}</td>
             <td style="${cell} white-space:nowrap;"><a href="${escapeHtml(r.projectUrl)}" target="_blank" style="color:#2563EB; font-weight:600;">Open</a></td>
           </tr>`
             )
             .join("")}
         </table>`;

  const bodyHtml = `
    <p style="margin:0 0 12px; font-size:16px; font-weight:700; color:#0F172A;">Invoices Unpaid for ${data.overdueDays}+ Days</p>
    ${summaryHtml}
    ${tableHtml}
    <p style="margin:16px 0 0; font-size:12px; color:#64748B;">${escapeHtml(scope)}</p>
  `;

  const textMoney = (v: number | null) => (v === null ? NOT_RECORDED : formatINR(v));
  const text = [
    `Invoices Unpaid for ${data.overdueDays}+ Days`,
    "",
    `Generated: ${data.generatedAt}`,
    `Raised / Submitted and Partially Paid invoices checked: ${data.eligibleCount}`,
    `Invoices unpaid for ${data.overdueDays}+ days: ${count}`,
    `Outstanding on fully unpaid (Raised / Submitted) invoices: ${formatINR(data.knownOutstandingINR)}`,
    ...(data.partiallyPaidCount > 0 ? [`Partially Paid invoices (outstanding not recorded): ${data.partiallyPaidCount}`] : []),
    "",
    ...(count === 0
      ? [`No invoice has been unpaid for ${data.overdueDays} days or more. No action is needed.`]
      : data.rows.map(
          (r) =>
            `- ${r.prNo} | ${r.client} | ${r.projectTitle} | Invoice ${r.invoiceNo} dated ${formatDate(r.invoiceDate)} (${r.daysSinceRaised} days) | ` +
            `Amount ${formatINR(r.invoiceAmountINR)}${r.originalAmountNote ? ` (${r.originalAmountNote})` : ""} | Paid ${textMoney(r.amountPaidINR)} | Outstanding ${textMoney(r.outstandingINR)} | ` +
            `${r.status} | PM: ${r.projectManager || "—"} | ${r.projectUrl}`
        )),
    "",
    scope,
    "",
    `${EMAIL_BRAND.COMPANY_NAME} ${EMAIL_BRAND.PORTAL_NAME}`,
  ].join("\n");

  return {
    subject: data.subject,
    html: renderEmailLayout({ bodyHtml, previewText: `${count} invoice(s) unpaid for ${data.overdueDays}+ days.`, maxWidthPx: 980 }),
    text,
  };
}
