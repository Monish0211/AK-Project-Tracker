import type { Prisma } from "../../../../generated/prisma/client.js";
import type { AccessTokenPayload } from "../../../shared/types/auth.types.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { assertProjectReadAccessById, authorizedProjectReadWhere } from "../../../shared/utils/projectAccess.js";
import { computeCommercialTotalsByProjectId } from "../../projects/services/project.service.js";
import { findEventsForLines } from "../../invoices/repository/invoiceStatusEvent.repository.js";
import { totalPagesFor } from "../../weeklyNotifications/weeklyPaging.js";
import * as repo from "../repository/invoiceTracker.repository.js";
import { groupInvoices, mergeInvoiceEvents, NOT_RAISED, parseMonth, paymentLabel, summarizeMonth, type MonthWindow } from "../invoiceTracker.rules.js";
import type { TrackerListQuery } from "../validators/invoiceTracker.validators.js";

function windowOf(month: string): MonthWindow {
  const w = parseMonth(month);
  if (!w) throw new AppError("month must be a real month in the form YYYY-MM.", 400);
  return w;
}

/**
 * The month's project table + exact month-wide totals. Totals cover EVERY project matching the search / status
 * filters (not just the visible page); the Raised / Not Raised / request filter narrows only the table.
 */
export async function getTrackerMonth(user: AccessTokenPayload, query: TrackerListQuery) {
  const window = windowOf(query.month);
  const scope = await authorizedProjectReadWhere(user);
  const and: Prisma.ProjectWhereInput[] = [scope];
  if (query.search) {
    and.push({
      OR: [
        { prNo: { contains: query.search, mode: "insensitive" } },
        { client: { contains: query.search, mode: "insensitive" } },
        { projectTitle: { contains: query.search, mode: "insensitive" } },
      ],
    });
  }
  if (query.projectStatus) and.push({ projectStatus: query.projectStatus });
  const base: Prisma.ProjectWhereInput = { AND: and };

  const tableWhere: Prisma.ProjectWhereInput =
    query.filter === "raised"
      ? { AND: [base, repo.raisedInMonthWhere(window)] }
      : query.filter === "notRaised"
        ? { AND: [base, { NOT: repo.raisedInMonthWhere(window) }] }
        : query.filter === "requestPending"
          ? { AND: [base, repo.OPEN_REQUEST_WHERE] }
          : base;

  const [projectCount, approvalPendingCount, lines, total, rows] = await Promise.all([
    repo.countProjects(base),
    repo.countProjects({ AND: [base, repo.OPEN_REQUEST_WHERE] }),
    repo.findMonthLines(base, window),
    query.filter === "all" ? repo.countProjects(base) : repo.countProjects(tableWhere),
    repo.findProjectsPage(tableWhere, (query.page - 1) * query.pageSize, query.pageSize),
  ]);

  const { summary, byProject } = summarizeMonth(lines, projectCount, approvalPendingCount);
  // The same batched WO value / pending due / open-request source Project Repository uses.
  const commercial = await computeCommercialTotalsByProjectId(rows.map((p) => p.id));

  return {
    month: window.month,
    summary,
    items: rows.map((p) => {
      const c = commercial.get(p.id);
      return {
        id: p.id,
        prNo: p.prNo,
        client: p.client,
        projectTitle: p.projectTitle,
        projectStatus: p.projectStatus,
        workOrderValueINR: c?.workOrderValueINR ?? 0,
        pendingDueINR: c?.pendingDueINR ?? 0,
        hasOpenInvoiceRequest: c?.hasOpenInvoiceRequest ?? false,
        month: byProject.get(p.id) ?? NOT_RAISED,
      };
    }),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: totalPagesFor(total, query.pageSize),
  };
}

const dateOnly = (d: Date): string => d.toISOString().slice(0, 10);
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** One project's invoices for the month (any status) with their recorded history — loaded when a row is expanded. */
export async function getProjectInvoiceChain(user: AccessTokenPayload, projectId: string, month: string) {
  const window = windowOf(month);
  await assertProjectReadAccessById(projectId, user);

  const [project, lines] = await Promise.all([repo.findProjectSummary(projectId), repo.findProjectLines(projectId)]);
  if (!project) throw new AppError("Project not found.", 404);

  const lineIds = lines.map((l) => l.id);
  // Two batched reads for the whole project — never per invoice.
  const [events, requests] = await Promise.all([findEventsForLines(lineIds), repo.findRequestsFulfilledBy(lineIds)]);

  const eventsByLine = new Map<string, typeof events>();
  for (const e of events) {
    const bucket = eventsByLine.get(e.invoiceLineId);
    if (bucket) bucket.push(e);
    else eventsByLine.set(e.invoiceLineId, [e]);
  }
  const requestByLine = new Map(requests.map((r) => [r.fulfilledInvoiceLineId, r]));

  const groups = groupInvoices(lines.map((l) => ({ ...l, projectId })));
  const invoices = groups.map((g) => {
    const groupEvents = g.lines.flatMap((l) => eventsByLine.get(l.id) ?? []);
    const request = g.lines.map((l) => requestByLine.get(l.id)).find((r) => r !== undefined);
    const currencies = [...new Set(g.lines.map((l) => l.currency))];
    const first = g.lines[0]!;
    const inSelectedMonth = g.lines.some((l) => l.invoiceDate >= window.start && l.invoiceDate < window.end);
    const statuses = [...new Set(g.lines.map((l) => l.status))];
    const foreign = currencies.length === 1 && currencies[0] !== "INR";
    return {
      key: g.key,
      invoiceNo: g.invoiceNo,
      invoiceDate: dateOnly(first.invoiceDate),
      inSelectedMonth,
      amountINR: g.amountINR,
      currency: currencies.length === 1 ? currencies[0]! : "Mixed",
      originalAmount: foreign
        ? round2(g.lines.filter((l) => l.status !== "Cancelled").reduce((s, l) => s + (l.invoiceAmountOriginal ?? l.invoiceAmountINR), 0))
        : null,
      status: g.status,
      mixedLineStatuses: statuses.length > 1,
      paymentStatus: paymentLabel(g.status),
      lines: g.lines.map((l) => ({ id: l.id, quantityItemId: l.quantityItemId, activity: l.quantityItem.description, status: l.status, amountINR: l.invoiceAmountINR })),
      // Record metadata only — when/who typed the invoice into the portal; NOT a status event.
      recordedInPortal: { at: first.createdAt.toISOString(), by: first.createdBy },
      hasRecordedHistory: groupEvents.length > 0,
      timeline: mergeInvoiceEvents(groupEvents),
      // A request is project-level; it is linked to an invoice only when that invoice's raise fulfilled it.
      invoiceRequest: request ? { id: request.id, submittedAt: request.createdAt.toISOString(), submittedBy: request.requestedBy.fullName } : null,
    };
  });

  return { month: window.month, project, invoices };
}
