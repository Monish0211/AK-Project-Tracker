/**
 * Project Financial Report PDF (Oct 2026) — A4 portrait, one project.
 *
 * Loaded on demand only (ProjectPdfButton dynamic-imports this module), so
 * jsPDF, jspdf-autotable, the embedded Noto Sans subsets and the logo never
 * enter the main bundle. Pure: takes already-fetched live data
 * (projectReportDataService.ts) and returns the PDF bytes — no I/O, no
 * cache access, no download side effects (the caller saves the Blob).
 *
 * Noto Sans is embedded (subset: Latin, punctuation, currency symbols —
 * see assets/fonts/OFL.txt) because jsPDF's built-in standard fonts have
 * no ₹ glyph.
 */
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { CellHookData, CellInput, UserOptions } from "jspdf-autotable";
import regularFontUrl from "../../assets/fonts/NotoSans-Regular-subset.ttf?inline";
import boldFontUrl from "../../assets/fonts/NotoSans-Bold-subset.ttf?inline";
import logoUrl from "../../assets/logo-report.jpg?inline";
import { computeProjectFinancials } from "../../utils/projectFinancials";
import type { ProjectFinancials } from "../../utils/projectFinancials";
import type { ProjectReportData } from "../../services/projectReportDataService";
import { sanitizeForPdf, UNSUPPORTED_MARKER } from "./pdfText";

export interface BuildProjectPdfOptions {
  /** IANA zone for the generated/as-of timestamp; defaults to the browser's own. Tests pin it. */
  timeZone?: string;
}

/** Wall-clock milliseconds per build phase (performance.now()), for diagnostics and benchmarks. */
export interface ProjectPdfTimings {
  prepare: number;
  setup: number;
  layout: number;
  decorate: number;
  serialize: number;
  total: number;
}

export interface BuiltProjectPdf {
  /** Absent only where Blob is unavailable; the worker path transfers `bytes` instead. */
  blob?: Blob;
  bytes: Uint8Array;
  filename: string;
  financials: ProjectFinancials;
  pageCount: number;
  /** true when some text contained characters the embedded font cannot draw (shown as U+FFFD). */
  textReplaced: boolean;
  timings: ProjectPdfTimings;
}

// ── Layout constants (mm) ────────────────────────────────────────────────
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 15;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_RESERVE = 18;
/** Running header on pages 2+: first baseline, line step, and gap below its separator (mm). */
const RUNNING_HEADER_TOP = 12;
const RUNNING_HEADER_LINE = 3.3;
const RUNNING_HEADER_MAX_LINES = 2;
const RUNNING_HEADER_GAP = 7.5;
const FONT = "NotoSans";
/** Section title + table header + ~3 rows. */
const TABLE_KEEP_WITH = 38;

type RGB = [number, number, number];
const NAVY: RGB = [30, 27, 99];
const RED: RGB = [184, 18, 46];
const TEXT: RGB = [33, 37, 41];
const MUTED: RGB = [108, 117, 125];
const BORDER: RGB = [222, 226, 230];
const SOFT: RGB = [246, 247, 251];
const GREEN: RGB = [25, 135, 84];
const AMBER: RGB = [176, 106, 0];
const BLUE: RGB = [37, 99, 235];
const ROSE: RGB = [200, 35, 51];
const CANCELLED: RGB = [160, 165, 170];

const NOT_RECORDED = "Not recorded";
const DASH = "—";
const NO_INVOICE_ACCESS = "Not available (no invoice access)";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ── Formatting helpers (exported for tests) ─────────────────────────────

// Built once and reused: Number.prototype.toLocaleString(locale, options)
// constructs a formatter on every call, which dominated large tables.
// Output is identical to utils/formatCurrency.ts's formatIndianCurrency().
const INR_FORMAT = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const HOURS_FORMAT = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const QUANTITY_FORMAT = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });

/** Exact INR with Indian grouping and 2 decimals; never prints "-0.00". */
export function formatReportINR(value: number): string {
  return `₹ ${INR_FORMAT.format(Math.abs(value) < 0.005 ? 0 : value)}`;
}

/** "2026-10-16" → "16 Oct 2026"; null → "—". Parsed by components, so no time-zone shift. */
export function formatReportDate(value: string | null): string {
  if (!value) return DASH;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return DASH;
  return `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

export function formatReportTimestamp(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(date);
}

function localDateKey(date: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Project-Financial-Report-<PR No.>-<YYYY-MM-DD>.pdf — PR No. reduced to filename-safe characters. */
export function buildProjectPdfFilename(prNo: string, generatedAt: Date, timeZone?: string): string {
  const safe = prNo.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-{2,}/g, "-").replace(/^[-.]+|[-.]+$/g, "") || "Project";
  return `Project-Financial-Report-${safe}-${localDateKey(generatedAt, timeZone)}.pdf`;
}

const STATUS_LABELS: Record<string, string> = {
  Draft: "Draft",
  Raised: "Raised",
  PartiallyPaid: "Partially Paid",
  Paid: "Paid",
  Cancelled: "Cancelled",
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? (status || "Unknown");
}

function orText(value: string | null | undefined, fallback = NOT_RECORDED): string {
  return value && value.trim() !== "" ? value : fallback;
}

function formatHours(value: number): string {
  return HOURS_FORMAT.format(value);
}

function formatQuantity(value: number): string {
  return QUANTITY_FORMAT.format(value);
}

function dataUrlBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
}

// ── Builder ──────────────────────────────────────────────────────────────

export function buildProjectFinancialPdf(input: ProjectReportData, options: BuildProjectPdfOptions = {}): BuiltProjectPdf {
  const tStart = performance.now();
  // Every string drawn below comes from this sanitized copy (see pdfText.ts).
  const { value: data, replaced: textReplaced } = sanitizeForPdf(input);
  const { project } = data;
  const tz = options.timeZone;
  const stamp = formatReportTimestamp(data.fetchedAt, tz);
  const financials = computeProjectFinancials({
    workOrderValueINR: project.workOrderValueINR,
    manhourCosts: data.manhourRows.map((r) => r.manhourCost),
    nonManhourRows: data.nonManhourRows,
    invoiceLines: data.invoiceRows,
  });
  const inv = financials.invoice;
  const tPrepared = performance.now();

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  doc.addFileToVFS("NotoSans-Regular.ttf", dataUrlBase64(regularFontUrl));
  doc.addFont("NotoSans-Regular.ttf", FONT, "normal");
  doc.addFileToVFS("NotoSans-Bold.ttf", dataUrlBase64(boldFontUrl));
  doc.addFont("NotoSans-Bold.ttf", FONT, "bold");
  doc.setFont(FONT, "normal");
  doc.setProperties({
    title: `Project Financial Report — ${project.prNo || project.projectTitle}`,
    subject: "Project Financial Report",
    author: "iFluids Engineering — PMO Dashboard",
    creator: "PMO Dashboard",
  });

  const setText = (size: number, color: RGB, style: "normal" | "bold" = "normal") => {
    doc.setFont(FONT, style);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
  };

  // Running header for pages 2+, measured before any table is laid out so
  // every continuation page reserves exactly the room it needs: wrapped to
  // at most two lines (long unbroken tokens are split by splitTextToSize),
  // the second line ellipsised if the full title is longer. The complete
  // title is always in Project Details on page 1.
  setText(7.5, MUTED);
  const runningHeaderText = ["Project Financial Report", project.prNo, project.projectTitle].filter((part) => part && part.trim() !== "").join(" · ");
  const runningHeaderLines = (doc.splitTextToSize(runningHeaderText, CONTENT_W) as string[]).slice(0, RUNNING_HEADER_MAX_LINES + 1);
  if (runningHeaderLines.length > RUNNING_HEADER_MAX_LINES) {
    let last = runningHeaderLines[RUNNING_HEADER_MAX_LINES - 1];
    while (last.length > 0 && doc.getTextWidth(`${last}…`) > CONTENT_W) last = last.slice(0, -1);
    runningHeaderLines.length = RUNNING_HEADER_MAX_LINES;
    runningHeaderLines[RUNNING_HEADER_MAX_LINES - 1] = `${last.trimEnd()}…`;
  }
  const runningSeparatorY = RUNNING_HEADER_TOP + (runningHeaderLines.length - 1) * RUNNING_HEADER_LINE + 2.5;
  const continuationTop = runningSeparatorY + RUNNING_HEADER_GAP;

  let y = MARGIN;
  const ensureSpace = (height: number) => {
    if (y + height > PAGE_H - FOOTER_RESERVE) {
      doc.addPage();
      y = continuationTop;
    }
  };
  const lastTableY = (): number => (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y;

  const tableBase: Partial<UserOptions> = {
    margin: { left: MARGIN, right: MARGIN, top: continuationTop, bottom: FOOTER_RESERVE },
    styles: { font: FONT, fontSize: 8, cellPadding: 1.8, textColor: TEXT, lineColor: BORDER, lineWidth: 0.1, overflow: "linebreak" },
    headStyles: { font: FONT, fontStyle: "bold", fillColor: NAVY, textColor: [255, 255, 255], fontSize: 8 },
    footStyles: { font: FONT, fontStyle: "bold", fillColor: SOFT, textColor: TEXT, fontSize: 8 },
    alternateRowStyles: { fillColor: [251, 251, 253] },
    theme: "grid",
    showHead: "everyPage",
    showFoot: "lastPage",
    rowPageBreak: "avoid",
  };

  /** keepWith: room needed for the title plus the first content it introduces, so a heading never ends a page alone. */
  const sectionTitle = (title: string, note?: string, keepWith = 16) => {
    ensureSpace(keepWith);
    y += 4;
    setText(11, NAVY, "bold");
    doc.text(title, MARGIN, y);
    if (note) {
      setText(7.5, MUTED);
      doc.text(note, PAGE_W - MARGIN, y, { align: "right" });
    }
    y += 1.6;
    doc.setDrawColor(RED[0], RED[1], RED[2]);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, MARGIN + 14, y);
    y += 3.5;
  };

  const tSetup = performance.now();

  // 1. Header ----------------------------------------------------------
  const logoW = 42;
  const logoH = (logoW * 174) / 480;
  doc.addImage(logoUrl, "JPEG", MARGIN, y, logoW, logoH);
  setText(17, NAVY, "bold");
  doc.text("Project Financial Report", PAGE_W - MARGIN, y + 6, { align: "right" });
  setText(9, TEXT, "bold");
  doc.text(orText(project.prNo, "PR No. not recorded"), PAGE_W - MARGIN, y + 11.5, { align: "right" });
  setText(8, MUTED);
  doc.text(`Generated ${stamp}`, PAGE_W - MARGIN, y + 15.5, { align: "right" });
  y += logoH + 3;
  doc.setDrawColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 2;

  // 2. Project details --------------------------------------------------
  sectionTitle("Project Details");
  const detail = (label: string, value: string): CellInput[] => [
    { content: label, styles: { textColor: MUTED, fontSize: 7.5 } },
    { content: value, styles: { fontStyle: "bold" } },
  ];
  const detailRows: CellInput[][] = [
    [
      { content: "Project Title", styles: { textColor: MUTED, fontSize: 7.5 } },
      { content: orText(project.projectTitle), colSpan: 3, styles: { fontStyle: "bold" } },
    ],
    [...detail("PR No.", orText(project.prNo)), ...detail("RFQ No.", orText(project.rfqNo))],
    [...detail("Client", orText(project.client)), ...detail("Department", orText(project.department))],
    [...detail("Project Status", orText(project.projectStatus)), ...detail("Domestic / Foreign", orText(project.domesticForeign))],
    [...detail("Contract Type", orText(project.contractType)), ...detail("Work Order Status", orText(project.workOrderStatus))],
    [...detail("Work Order No.", orText(project.workOrderNumber)), ...detail("Work Order Date", formatReportDate(project.workOrderDate))],
    [...detail("Start Date", formatReportDate(project.projectStartDate)), ...detail("End Date", formatReportDate(project.projectEndDate))],
    [...detail("Primary Project Manager", orText(project.primaryProjectManager)), ...detail("Secondary Project Manager", orText(project.secondaryProjectManager))],
    [
      ...detail("PMO Coordinator", orText(project.pmoCoordinator)),
      ...(project.actualCompletionDate ? detail("Actual Completion", formatReportDate(project.actualCompletionDate)) : detail("", "")),
    ],
  ];
  autoTable(doc, {
    ...tableBase,
    startY: y,
    theme: "plain",
    body: detailRows,
    styles: { font: FONT, fontSize: 8.5, cellPadding: { top: 1.2, bottom: 1.2, left: 1.5, right: 1.5 }, textColor: TEXT, overflow: "linebreak" },
    columnStyles: { 0: { cellWidth: 36 }, 1: { cellWidth: 54 }, 2: { cellWidth: 36 }, 3: { cellWidth: 54 } },
    alternateRowStyles: {},
    rowPageBreak: "avoid",
  });
  y = lastTableY() + 3;
  if (textReplaced) {
    const note = `Some names or descriptions contain characters this PDF cannot display (for example Tamil, Hindi, Chinese or emoji); each such run is shown as ${UNSUPPORTED_MARKER}. The original text is unchanged in the PMO Portal.`;
    setText(7, AMBER);
    const noteLines = doc.splitTextToSize(note, CONTENT_W) as string[];
    ensureSpace(noteLines.length * 3 + 2);
    doc.text(noteLines, MARGIN, y + 1.5);
    y += noteLines.length * 3 + 1.5;
  }

  // 3. KPI tiles --------------------------------------------------------
  sectionTitle("Financial Summary", "All amounts in INR", 60);
  interface Tile {
    label: string;
    value: string;
    sub: string;
    color: RGB;
  }
  const profitPct = financials.profitPercent === null ? DASH : `${financials.profitPercent.toFixed(1)}%`;
  const draftNote = inv && inv.draftCount > 0 ? `incl. Drafts (${formatReportINR(inv.draftAmount)})` : "incl. Drafts";
  const tiles: Tile[] = [
    { label: "Work Order Value", value: formatReportINR(financials.workOrderValue), sub: "Live from quantity items", color: NAVY },
    { label: "Invoice Raised", value: inv ? formatReportINR(inv.raised) : "Not available", sub: inv ? draftNote : "No invoice access", color: BLUE },
    { label: "Payment Received", value: inv ? formatReportINR(inv.received) : "Not available", sub: inv ? "Paid invoices" : "No invoice access", color: GREEN },
    { label: "Outstanding", value: inv ? formatReportINR(inv.outstanding) : "Not available", sub: inv ? "Work Order Value − Received" : "No invoice access", color: AMBER },
    { label: "Total Expenses", value: formatReportINR(financials.expenses), sub: "Man-hour + Non-man-hour", color: ROSE },
    { label: "Profit", value: formatReportINR(financials.profit), sub: `Profit % ${profitPct}`, color: financials.profit >= 0 ? GREEN : ROSE },
  ];
  const gap = 4;
  const tileW = (CONTENT_W - gap * 2) / 3;
  const tileH = 19;
  ensureSpace(tileH * 2 + gap);
  tiles.forEach((tile, i) => {
    const x = MARGIN + (i % 3) * (tileW + gap);
    const ty = y + Math.floor(i / 3) * (tileH + gap);
    doc.setFillColor(SOFT[0], SOFT[1], SOFT[2]);
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, ty, tileW, tileH, 1.5, 1.5, "FD");
    doc.setFillColor(tile.color[0], tile.color[1], tile.color[2]);
    doc.rect(x, ty + 1.5, 1.2, tileH - 3, "F");
    setText(7.5, MUTED, "bold");
    doc.text(tile.label.toUpperCase(), x + 4, ty + 5);
    let size = 12;
    setText(size, tile.color, "bold");
    while (size > 7 && doc.getTextWidth(tile.value) > tileW - 7) {
      size -= 0.5;
      doc.setFontSize(size);
    }
    doc.text(tile.value, x + 4, ty + 11.5);
    setText(7, MUTED);
    doc.text(tile.sub, x + 4, ty + 16);
  });
  y += tileH * 2 + gap + 3;

  // 4. Comparison bars --------------------------------------------------
  sectionTitle("Financial Overview", undefined, 48);
  const bars: { label: string; value: number | null; color: RGB }[] = [
    { label: "Work Order Value", value: financials.workOrderValue, color: NAVY },
    { label: "Invoice Raised", value: inv ? inv.raised : null, color: BLUE },
    { label: "Payment Received", value: inv ? inv.received : null, color: GREEN },
    { label: "Total Expenses", value: financials.expenses, color: ROSE },
    { label: "Profit", value: financials.profit, color: financials.profit >= 0 ? GREEN : ROSE },
  ];
  const barMax = Math.max(1, ...bars.map((b) => Math.abs(b.value ?? 0)));
  const labelW = 34;
  const valueW = 40;
  const trackW = CONTENT_W - labelW - valueW - 4;
  const barH = 4.2;
  ensureSpace(bars.length * 7 + 2);
  for (const bar of bars) {
    setText(8, TEXT);
    doc.text(bar.label, MARGIN, y + 3.2);
    const tx = MARGIN + labelW;
    doc.setFillColor(238, 240, 245);
    doc.rect(tx, y, trackW, barH, "F");
    if (bar.value !== null && bar.value !== 0) {
      const w = Math.max(0.6, (Math.abs(bar.value) / barMax) * trackW);
      doc.setFillColor(bar.color[0], bar.color[1], bar.color[2]);
      doc.rect(tx, y, w, barH, "F");
    }
    setText(8, bar.value === null ? MUTED : TEXT, bar.value === null ? "normal" : "bold");
    doc.text(bar.value === null ? "Not available" : formatReportINR(bar.value), PAGE_W - MARGIN, y + 3.2, { align: "right" });
    y += 7;
  }
  if (financials.profit < 0) {
    setText(7, MUTED);
    doc.text("Negative profit is drawn by magnitude in red.", MARGIN + labelW, y + 0.5);
    y += 3;
  }
  y += 1;

  // 5. Man-hour expenses ------------------------------------------------
  sectionTitle("Man-hour Expenses", `${data.manhourRows.length} resource${data.manhourRows.length === 1 ? "" : "s"}`, TABLE_KEEP_WITH);
  const manhourBody: CellInput[][] = data.manhourRows.length
    ? data.manhourRows.map((r) => [
        r.employeeName,
        r.employeeNo || DASH,
        r.designation ?? DASH,
        r.assignmentStatus || DASH,
        formatHours(r.totalHours),
        formatReportINR(r.hourlyRate),
        formatReportINR(r.manhourCost),
      ])
    : [[{ content: "No man-hour resources recorded for this project.", colSpan: 7, styles: { textColor: MUTED, halign: "center" } }]];
  autoTable(doc, {
    ...tableBase,
    startY: y,
    head: [["Employee", "Emp. No.", "Designation", "Status", "Hours", "Rate / hr", "Man-hour Cost"]],
    body: manhourBody,
    foot: [[{ content: "Man-hour subtotal", colSpan: 6, styles: { halign: "right" } }, { content: formatReportINR(financials.manhourTotal), styles: { halign: "right" } }]],
    columnStyles: { 0: { cellWidth: 38 }, 1: { cellWidth: 20 }, 2: { cellWidth: 30 }, 3: { cellWidth: 18 }, 4: { halign: "right", cellWidth: 16 }, 5: { halign: "right", cellWidth: 26 }, 6: { halign: "right" } },
  });
  y = lastTableY() + 2;
  if (data.manhourRows.some((r) => !r.nameFromDirectory)) {
    ensureSpace(5);
    setText(7, MUTED);
    doc.text("Employees not found in the Employee Master list are shown by employee number.", MARGIN, y + 2);
    y += 4;
  }
  y += 2;

  // 6. Non-man-hour expenses --------------------------------------------
  sectionTitle("Non-man-hour Expenses", `${data.nonManhourRows.length} item${data.nonManhourRows.length === 1 ? "" : "s"}`, TABLE_KEEP_WITH);
  const nonManhourBody: CellInput[][] = data.nonManhourRows.length
    ? data.nonManhourRows.map((r) => [
        r.category || DASH,
        r.description || DASH,
        formatQuantity(r.quantity),
        formatReportINR(r.unitCost),
        formatReportINR(r.totalCost),
        r.remarks ?? DASH,
      ])
    : [[{ content: "No non-man-hour expenses recorded for this project.", colSpan: 6, styles: { textColor: MUTED, halign: "center" } }]];
  autoTable(doc, {
    ...tableBase,
    startY: y,
    head: [["Category", "Description", "Qty", "Unit Cost", "Total Cost", "Remarks"]],
    body: nonManhourBody,
    foot: [[{ content: "Non-man-hour subtotal", colSpan: 4, styles: { halign: "right" } }, { content: formatReportINR(financials.nonManhourTotal), styles: { halign: "right" } }, ""]],
    columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 46 }, 2: { halign: "right", cellWidth: 14 }, 3: { halign: "right", cellWidth: 27 }, 4: { halign: "right", cellWidth: 29 }, 5: {} },
  });
  y = lastTableY() + 4;

  // 7. Expense grand total ---------------------------------------------
  autoTable(doc, {
    ...tableBase,
    startY: y,
    theme: "plain",
    tableWidth: 90,
    margin: { left: PAGE_W - MARGIN - 90, right: MARGIN, top: continuationTop, bottom: FOOTER_RESERVE },
    body: [
      ["Man-hour expenses", formatReportINR(financials.manhourTotal)],
      ["Non-man-hour expenses", formatReportINR(financials.nonManhourTotal)],
      [
        { content: "Total Expenses", styles: { fontStyle: "bold", fillColor: SOFT, textColor: NAVY } },
        { content: formatReportINR(financials.expenses), styles: { fontStyle: "bold", fillColor: SOFT, textColor: NAVY } },
      ],
    ],
    styles: { font: FONT, fontSize: 8.5, cellPadding: 1.6, textColor: TEXT },
    columnStyles: { 1: { halign: "right" } },
    alternateRowStyles: {},
    pageBreak: "avoid",
  });
  y = lastTableY() + 4;

  // 8. Invoices ---------------------------------------------------------
  sectionTitle("Invoices", inv ? "Draft included in Invoice Raised · Cancelled excluded" : undefined, TABLE_KEEP_WITH);
  if (data.invoiceRows === null || !inv) {
    ensureSpace(12);
    doc.setFillColor(SOFT[0], SOFT[1], SOFT[2]);
    doc.roundedRect(MARGIN, y, CONTENT_W, 10, 1.5, 1.5, "F");
    setText(8.5, MUTED);
    doc.text(`${NO_INVOICE_ACCESS} — your account does not have access to invoice data for this project.`, MARGIN + 4, y + 6.2);
    y += 14;
  } else {
    const rows = data.invoiceRows;
    const invoiceBody: CellInput[][] = rows.length
      ? rows.map((r) => {
          const item = [r.milestoneName, r.itemDescription].filter(Boolean).join(" · ") || DASH;
          const status = r.status === "Draft" ? "DRAFT" : r.status === "Cancelled" ? "Cancelled (excluded)" : statusLabel(r.status);
          const original = r.currency !== "INR" && r.invoiceAmountOriginal !== null ? `${r.currency} ${INR_FORMAT.format(r.invoiceAmountOriginal)}` : DASH;
          return [r.invoiceNo || DASH, formatReportDate(r.invoiceDate), item, status, original, formatReportINR(r.invoiceAmountINR)];
        })
      : [[{ content: "No invoices raised for this project yet.", colSpan: 6, styles: { textColor: MUTED, halign: "center" } }]];
    autoTable(doc, {
      ...tableBase,
      startY: y,
      head: [["Invoice No.", "Date", "Milestone / Item", "Status", "Original Amount", "Amount (INR)"]],
      body: invoiceBody,
      columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 21 }, 2: { cellWidth: 52 }, 3: { cellWidth: 25 }, 4: { halign: "right", cellWidth: 24 }, 5: { halign: "right" } },
      didParseCell: (hook: CellHookData) => {
        if (hook.section !== "body" || rows.length === 0) return;
        const row = rows[hook.row.index];
        if (!row) return;
        if (row.status === "Cancelled") {
          hook.cell.styles.textColor = CANCELLED;
          hook.cell.styles.fontStyle = "normal";
        } else if (row.status === "Draft" && hook.column.index === 3) {
          hook.cell.styles.fillColor = [255, 243, 205];
          hook.cell.styles.textColor = AMBER;
          hook.cell.styles.fontStyle = "bold";
        }
      },
    });
    y = lastTableY() + 4;

    // Totals by status + the three headline invoice figures.
    const statusBody: CellInput[][] = inv.byStatus.map((s) => [
      s.status === "Cancelled" ? "Cancelled (excluded)" : statusLabel(s.status),
      String(s.count),
      formatReportINR(s.amount),
    ]);
    const strong = (content: string, halign: "left" | "right" = "left"): CellInput => ({ content, styles: { fontStyle: "bold", fillColor: SOFT, textColor: NAVY, halign } });
    autoTable(doc, {
      ...tableBase,
      startY: y,
      tableWidth: 110,
      margin: { left: PAGE_W - MARGIN - 110, right: MARGIN, top: continuationTop, bottom: FOOTER_RESERVE },
      head: [["Totals by status", "Count", "Amount (INR)"]],
      body: [
        ...statusBody,
        [strong("Invoice Raised (incl. Draft, excl. Cancelled)"), strong(""), strong(formatReportINR(inv.raised), "right")],
        [strong("Payment Received (Paid)"), strong(""), strong(formatReportINR(inv.received), "right")],
        [strong("Outstanding (Work Order Value − Received)"), strong(""), strong(formatReportINR(inv.outstanding), "right")],
      ],
      columnStyles: { 1: { halign: "right", cellWidth: 14 }, 2: { halign: "right", cellWidth: 32 } },
      pageBreak: "avoid",
      showFoot: "never",
    });
    y = lastTableY() + 2;
  }

  // 9. Running header + footer on every page ----------------------------
  const tLaidOut = performance.now();
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    if (page > 1) {
      setText(7.5, MUTED);
      runningHeaderLines.forEach((line, i) => doc.text(line, MARGIN, RUNNING_HEADER_TOP + i * RUNNING_HEADER_LINE));
      doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
      doc.setLineWidth(0.2);
      doc.line(MARGIN, runningSeparatorY, PAGE_W - MARGIN, runningSeparatorY);
    }
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, PAGE_H - 12, PAGE_W - MARGIN, PAGE_H - 12);
    setText(7, MUTED);
    doc.text(`Confidential — iFluids Engineering · Generated ${stamp} · Live data as of generation time`, MARGIN, PAGE_H - 8);
    doc.text(`Page ${page} of ${pageCount}`, PAGE_W - MARGIN, PAGE_H - 8, { align: "right" });
  }

  const tDecorated = performance.now();
  const buffer = doc.output("arraybuffer");
  const bytes = new Uint8Array(buffer);
  const tEnd = performance.now();
  return {
    blob: typeof Blob === "undefined" ? undefined : new Blob([bytes], { type: "application/pdf" }),
    bytes,
    filename: buildProjectPdfFilename(project.prNo, data.fetchedAt, tz),
    financials,
    pageCount,
    textReplaced,
    timings: {
      prepare: tPrepared - tStart,
      setup: tSetup - tPrepared,
      layout: tLaidOut - tSetup,
      decorate: tDecorated - tLaidOut,
      serialize: tEnd - tDecorated,
      total: tEnd - tStart,
    },
  };
}
