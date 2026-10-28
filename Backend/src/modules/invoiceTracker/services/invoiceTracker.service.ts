import type { Prisma } from "../../../../generated/prisma/client.js";
import type { AccessTokenPayload } from "../../../shared/types/auth.types.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { env } from "../../../shared/utils/env.js";
import { assertProjectReadAccessById, authorizedProjectReadWhere } from "../../../shared/utils/projectAccess.js";
import { computeCommercialTotalsByProjectId } from "../../projects/services/project.service.js";
import { findEventsForLines } from "../../invoices/repository/invoiceStatusEvent.repository.js";
import { prNoCollator } from "../../weeklyNotifications/missingExpense.rules.js";
import { daysFrom, zonedToday } from "../../weeklyNotifications/unpaidInvoice.rules.js";
import { totalPagesFor } from "../../weeklyNotifications/weeklyPaging.js";
import * as repo from "../repository/invoiceTracker.repository.js";
import {
  ALL_MONTHS,
  financialsOf,
  firstRaisedAt,
  groupInvoices,
  approvalSubmittedAtOf,
  compareProjectRows,
  rankProject,
  inWindow,
  invoiceTier,
  invoicesDatedIn,
  istMonthOf,
  mergeInvoiceEvents,
  normalizeStatus,
  orderRecords,
  parseMonth,
  paymentLabel,
  requestTier,
  summarizeOutstanding,
  summarizeRecords,
  type InvoiceGroup,
  type MonthWindow,
  hasMixedLiveStatuses,
  isRaisedStatus,
  compareNewestFirst,
  inInvoiceMonth,
  invoicesUpTo,
  latestRaisedGroup,
  olderOutstanding,
  isValidInvoiceDate,
  orderAllRecords,
  selectLatestRecord,
  shortRequestRef,
  type LatestRecord,
  type OrderableRecord,
  type ProjectRank,
  type ProjectRecordState,
  type SummaryRequest,
} from "../invoiceTracker.rules.js";
import type { OutstandingQuery, TrackerListQuery } from "../validators/invoiceTracker.validators.js";

/** null = every month ("All history"). */
function windowOf(month: string): MonthWindow | null {
  if (month === ALL_MONTHS) return null;
  const w = parseMonth(month);
  if (!w) throw new AppError('month must be a real month in the form YYYY-MM, or "all".', 400);
  return w;
}

async function scopedBase(user: AccessTokenPayload, query: { search?: string | undefined; projectStatus?: string | undefined }): Promise<Prisma.ProjectWhereInput> {
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
  return { AND: and };
}

const dateOnly = (d: Date): string => d.toISOString().slice(0, 10);

/** An invoice with no usable invoice date is flagged for review — never silently given its creation date. */
function withDateFlag<T extends { flags: string[] }>(fin: T, missing: boolean): T {
  return missing ? { ...fin, flags: [...fin.flags, "Invoice date is missing or invalid — not in any month's report"] } : fin;
}
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * The month's selection — ONE place decides which invoices and requests a report contains and which projects it lists. The project
 * table, the summary cards AND the Raised-amount breakdown all read it, so the breakdown can never add up different invoices than the
 * card it explains. (Moved out of getTrackerMonth unchanged.)
 */
async function selectMonth(user: AccessTokenPayload, query: TrackerListQuery) {
  const window = windowOf(query.month);
  const base = await scopedBase(user, query);

  // Invoices: an invoice's date is its earliest usable line date, so candidate projects are found by any line dated in the
  // month and then ALL of their lines are read to decide each invoice's real date.
  const projectIds = window ? await repo.findProjectIdsWithInvoiceDateIn(base, window) : null;
  const [lines, requests] = await Promise.all([
    projectIds === null ? repo.findLinesInScope(base) : repo.findLinesForProjects(projectIds),
    repo.findRequests(base, window),
  ]);
  const allGroups = groupInvoices(lines);
  const invoices = invoicesDatedIn(allGroups, window);

  // The month view ranks raised-in-the-month records first, from each invoice's RECORDED raise (status history). One grouped
  // read for the month's invoices; no raise time is invented for invoices that have none.
  if (window) {
    const raiseTimes = await repo.findFirstRaiseTimes(invoices.flatMap((g) => g.lines.map((l) => l.id)));
    for (const g of invoices) {
      let first: Date | null = null;
      for (const l of g.lines) {
        const t = raiseTimes.get(l.id);
        if (t && (first === null || t < first)) first = t;
      }
      g.raisedAt = first;
    }
  }
  const { byProject } = summarizeRecords(invoices, requests, window);

  const matches = (st: ProjectRecordState): boolean =>
    query.filter === "raised" ? st.raisedInvoiceCount > 0 : query.filter === "notRaised" ? st.raisedInvoiceCount === 0 : query.filter === "requestPending" ? st.openRequestCount > 0 : true;
  const tableIds = [...byProject.entries()].filter(([, st]) => matches(st)).map(([id]) => id);

  // The cards describe exactly the projects listed: search, project status AND the "Show" filter all apply to them.
  const listed = new Set(tableIds);
  const { summary } = summarizeRecords(
    invoices.filter((g) => listed.has(g.projectId)),
    requests.filter((r) => listed.has(r.projectId)),
    window
  );

  return { window, base, lines, requests, invoices, byProject, tableIds, listed, summary };
}

/**
 * The report's project table + exact period-wide totals. A project appears only when it has at least one workflow record in
 * the selected month ("all" = any month): an invoice DATED in it (invoice date, never creation / raise / payment date) or an
 * Invoice Request created in it (requests have no invoice date). Totals cover EVERY
 * qualifying project matching the search / status filters (not just the visible page); the state filter narrows only
 * the table.
 */
export async function getTrackerMonth(user: AccessTokenPayload, query: TrackerListQuery) {
  const { window, base, lines, requests, invoices, byProject, tableIds, listed, summary } = await selectMonth(user, query);

  // THE ROW ORDER needs, for EVERY listed project (not only the visible page), the one record its row displays and that record's original
  // approval submission — so the full lifecycle of every listed project is read here, in two batched queries whatever the page holds:
  // all requests of any date (an Open request from last month is still the latest record) and, in a month view, the lines of the
  // request-only projects (the month's lines cover only projects with an invoice dated in it). All history already read every line.
  const loadedProjects = new Set(lines.map((l) => l.projectId));
  const [extraLines, requestRows] = await Promise.all([
    window ? repo.findLinesForProjects(tableIds.filter((id) => !loadedProjects.has(id))) : Promise.resolve([]),
    repo.findRequestsForProjects(tableIds),
  ]);
  const requestsByProject = new Map<string, SummaryRequest[]>();
  for (const r of requestRows) {
    const list = requestsByProject.get(r.projectId);
    const lite = { id: r.id, status: r.status, createdAt: r.createdAt, fulfilledInvoiceLineId: r.fulfilledInvoiceLineId };
    if (list) list.push(lite);
    else requestsByProject.set(r.projectId, [lite]);
  }
  const groupsByProject = new Map<string, InvoiceGroup[]>();
  for (const g of groupInvoices([...lines.filter((l) => listed.has(l.projectId)), ...extraLines])) {
    const list = groupsByProject.get(g.projectId);
    if (list) list.push(g);
    else groupsByProject.set(g.projectId, [g]);
  }

  // Inputs for a project that displays NOTHING: the month's newest-dated record and the LATEST request the report covers.
  const newestMonthRecord = new Map<string, number>();
  const latestCoveredRequest = new Map<string, Date>();
  for (const g of invoices) {
    if (!listed.has(g.projectId)) continue;
    if (g.invoiceDate) newestMonthRecord.set(g.projectId, Math.max(newestMonthRecord.get(g.projectId) ?? 0, g.invoiceDate.getTime()));
  }
  for (const r of requests) {
    if (!listed.has(r.projectId)) continue;
    newestMonthRecord.set(r.projectId, Math.max(newestMonthRecord.get(r.projectId) ?? 0, r.createdAt.getTime()));
    const current = latestCoveredRequest.get(r.projectId);
    if (!current || r.createdAt > current) latestCoveredRequest.set(r.projectId, r.createdAt);
  }

  // ONE record per project decides both what the row displays and where it sits (see rankProject): the project's latest record, positioned
  // by the original submission of the approval request behind it. Nothing here reads a status change time, a payment or an update time.
  const latestOf = new Map<string, LatestRecord | null>();
  const approvalOf = new Map<string, Date | null>();
  const rankOf = new Map<string, ProjectRank>();
  for (const id of tableIds) {
    const groups = groupsByProject.get(id) ?? [];
    const reqs = requestsByProject.get(id) ?? [];
    const latestRecord = selectLatestRecord(groups, reqs, window);
    const approval = approvalSubmittedAtOf(latestRecord, groups, reqs);
    latestOf.set(id, latestRecord);
    approvalOf.set(id, approval);
    rankOf.set(
      id,
      rankProject(
        {
          latest: latestRecord,
          approvalSubmittedAt: latestRecord ? approval : (latestCoveredRequest.get(id) ?? null),
          fallbackAt: newestMonthRecord.has(id) ? new Date(newestMonthRecord.get(id)!) : null,
        },
        window
      )
    );
  }
  const allRows = await repo.findProjectsByIds(base, tableIds);
  allRows.sort((a, b) => compareProjectRows({ rank: rankOf.get(a.id)!, prNo: a.prNo, id: a.id }, { rank: rankOf.get(b.id)!, prNo: b.prNo, id: b.id }, (x, y) => prNoCollator.compare(x, y)));
  const rows = allRows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize);
  const total = allRows.length;

  // The same batched WO value / pending due / open-request source Project Repository uses.
  const commercial = await computeCommercialTotalsByProjectId(rows.map((p) => p.id));

  // HEADLINE per listed project: its latest raised invoice and the older outstanding ones — from the same all-dates lines as above.
  // Nothing here feeds the cards — they were computed above from the month's invoices only.
  const headlineOf = (projectId: string) => {
    const groups = groupsByProject.get(projectId) ?? [];
    const latest = latestRaisedGroup(invoicesUpTo(groups, window));
    const older = olderOutstanding(invoicesUpTo(groups, window), latest, groups);
    return {
      /**
       * The ONE record the project row shows (Latest Invoice Amount + Status): the project's latest invoice or approval request up to the end
       * of the selected month — see selectLatestRecord() in the rules. null = the project has no relevant record yet. The row's position is
       * decided by this same record (see sortTier / approvalSubmittedAt below).
       */
      latestRecord: latestOf.get(projectId) ?? null,
      latestRaised: latest
        ? { invoiceNo: latest.invoiceNo, invoiceDate: dateOnly(latest.invoiceDate!), amountINR: latest.amountINR, status: latest.status, paymentStatus: paymentLabel(latest.status), inMonth: window ? inInvoiceMonth(latest.invoiceDate, window) : null }
        : null,
      olderOutstanding: { count: older.count, amountINR: older.amountINR, knownAmountINR: older.knownAmountINR, unknownCount: older.unknownCount, undatedCount: older.undatedCount },
    };
  };

  return {
    month: query.month,
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
        /**
         * Which rule placed this row (the rules' ORDER OF PROJECTS). Month view: 1 = its displayed record belongs to an approval request
         * submitted in the month (latest submission first), 2 = every other displayed record (its date, latest first), 3 = nothing
         * displayed. All history: 1 = ordered by approval submission, 0 = no approval request (PR-number order).
         */
        sortTier: window ? rankOf.get(p.id)!.group : rankOf.get(p.id)!.group === 1 ? 1 : 0,
        sortBasis: rankOf.get(p.id)!.basis,
        /**
         * The ORIGINAL submission instant of the approval request behind the displayed record (null = that record has none: raised outside the
         * Request Invoice workflow). It is the request's createdAt — never changed by fulfilment, raising or payment. When the row is ordered by
         * approval submission this is exactly the instant that placed it (for a project that displays nothing: its latest covered request).
         */
        approvalSubmittedAt: (rankOf.get(p.id)!.approvalAt !== null ? new Date(rankOf.get(p.id)!.approvalAt!) : approvalOf.get(p.id))?.toISOString() ?? null,
        ...headlineOf(p.id),
        records: byProject.get(p.id)!,
      };
    }),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: totalPagesFor(total, query.pageSize),
  };
}

/**
 * RAISED INVOICE AMOUNT — BREAKDOWN. The invoices behind the card's total, grouped by project: exactly the raised-class invoices
 * (Raised, Partially Paid, Paid) of the projects the report LISTS, taken from the same selection as the card (selectMonth), so the
 * total here IS `summary.raisedAmountINR` and the invoice count IS `summary.invoicesRaised`. An invoice counts once, at its live (non-
 * cancelled) lines' amount, in the month of its invoice date. Drafts, cancelled invoices and requests are not in it. All projects'
 * totals are returned in a stable order (largest first); only the visible page of projects carries its invoices.
 */
export async function getRaisedBreakdown(user: AccessTokenPayload, query: TrackerListQuery) {
  const { window, base, invoices, listed } = await selectMonth(user, query);
  const raised = invoices.filter((g) => listed.has(g.projectId) && isRaisedStatus(g.status));

  const byProject = new Map<string, InvoiceGroup[]>();
  for (const g of raised) {
    const list = byProject.get(g.projectId);
    if (list) list.push(g);
    else byProject.set(g.projectId, [g]);
  }
  const info = new Map((await repo.findProjectsByIds(base, [...byProject.keys()])).map((p) => [p.id, p]));
  const all = [...byProject.entries()]
    .filter(([id]) => info.has(id))
    .map(([id, groups]) => {
      const p = info.get(id)!;
      const sorted = [...groups].sort(compareNewestFirst);
      return {
        projectId: id,
        prNo: p.prNo,
        client: p.client,
        projectTitle: p.projectTitle,
        projectStatus: p.projectStatus,
        invoiceCount: sorted.length,
        totalINR: round2(sorted.reduce((sum, g) => sum + g.amountINR, 0)),
        invoices: sorted.map((g) => ({
          key: g.key,
          invoiceNo: g.invoiceNo,
          /** The invoice date (date-only). null only in "all" for an invoice with no usable date — it is in no month. */
          invoiceDate: g.invoiceDate ? dateOnly(g.invoiceDate) : null,
          status: normalizeStatus(g.status),
          amountINR: g.amountINR,
          /** Lines of this invoice that are Cancelled: they are not part of `amountINR`. */
          cancelledLineCount: g.lines.filter((l) => normalizeStatus(l.status) === "Cancelled").length,
        })),
      };
    })
    .sort((a, b) => b.totalINR - a.totalINR || prNoCollator.compare(a.prNo, b.prNo) || (a.projectId < b.projectId ? -1 : 1));

  const totalINR = round2(all.reduce((sum, p) => sum + p.totalINR, 0));
  const invoiceCount = all.reduce((sum, p) => sum + p.invoiceCount, 0);
  return {
    month: query.month,
    totalINR,
    invoiceCount,
    projectCount: all.length,
    projects: all.slice((query.page - 1) * query.pageSize, query.page * query.pageSize),
    page: query.page,
    pageSize: query.pageSize,
    totalPages: totalPagesFor(all.length, query.pageSize),
    /** Echoed so a client can tell which period / window the figures describe. */
    periodStart: window ? dateOnly(window.dateStart) : null,
  };
}

const REQUEST_LABEL = { Open: "Invoice Requested", Completed: "Completed" } as const;

/**
 * One project's workflow records for the month ("all" = every month): the invoices created in it (with their recorded
 * status history) and the Invoice Requests created in it — loaded when a row is expanded.
 */
export async function getProjectRecords(user: AccessTokenPayload, projectId: string, month: string) {
  const window = windowOf(month);
  await assertProjectReadAccessById(projectId, user);

  const [project, lines, allRequests] = await Promise.all([repo.findProjectSummary(projectId), repo.findProjectLinesDetailed(projectId), repo.findProjectRequestsDetailed(projectId, null)]);
  if (!project) throw new AppError("Project not found.", 404);
  // Requests mirror invoices: the month's own (created in it) and the EARLIER ones, for context. A request created after the month's end
  // is the future of this report and is not returned. "All history" has every request in `requests`.
  const requests = window ? allRequests.filter((r) => inWindow(r.createdAt, window)) : allRequests;
  const previousRequests = window ? allRequests.filter((r) => r.createdAt.getTime() < window.start.getTime()) : [];

  const allGroups = groupInvoices(lines.map((l) => ({ ...l, projectId })));
  const groups = invoicesDatedIn(allGroups, window);
  const latestRecord = selectLatestRecord(
    allGroups,
    allRequests.map((r) => ({ id: r.id, status: r.status, createdAt: r.createdAt, fulfilledInvoiceLineId: r.fulfilledInvoiceLineId })),
    window
  );
  groups.sort((a, b) => (b.invoiceDate?.getTime() ?? 0) - (a.invoiceDate?.getTime() ?? 0) || (a.key < b.key ? -1 : 1));

  // PREVIOUS invoices — billing context only: this project's other invoices whose usable invoice date is EARLIER than the month. They are
  // never part of the month (and so never of its totals: the list endpoint that feeds the cards does not read this), and an invoice
  // is in exactly one of the two lists. An invoice with no usable date is in neither — it is only counted so the UI can flag it; it is
  // never placed in a month by its creation date. (All-history lists everything in `invoices`, so it has no previous section.)
  const previousGroups = window ? allGroups.filter((g) => g.invoiceDate !== null && g.invoiceDate < window.dateStart) : [];
  previousGroups.sort((a, b) => b.invoiceDate!.getTime() - a.invoiceDate!.getTime() || (a.key < b.key ? -1 : 1));
  const undatedInvoiceCount = window ? allGroups.filter((g) => g.invoiceDate === null).length : 0;

  // The sections of a month report (none for All history, which lists everything once in `invoices`):
  //  - the LATEST RAISED invoice among those dated up to the end of the month (headline);
  //  - the month's DRAFTS (never the headline);
  //  - HISTORY = every other invoice dated up to the end of the month, newest first (earlier raised / paid / partially paid, older
  //    drafts, cancelled, and this month's other raised invoices) — an invoice is in exactly one of headline / drafts / history;
  //  - OLDER OUTSTANDING relative to the headline, traceable to rows of the history.
  const context = window ? invoicesUpTo(allGroups, window) : [];
  const latest = window ? latestRaisedGroup(context) : null;
  const older = window ? olderOutstanding(context, latest, allGroups) : olderOutstanding([], null, []);
  const draftGroups = window ? context.filter((g) => normalizeStatus(g.status) === "Draft" && inInvoiceMonth(g.invoiceDate, window)).sort(compareNewestFirst) : [];
  const draftSet = new Set(draftGroups);
  const historyGroups = context.filter((g) => g !== latest && !draftSet.has(g)).sort(compareNewestFirst);

  const lineIds = [...groups, ...previousGroups].flatMap((g) => g.lines.map((l) => l.id));
  // Two batched reads for the whole project — never per invoice.
  const [events, fulfilled] = await Promise.all([findEventsForLines(lineIds), repo.findRequestsFulfilledBy(lineIds)]);
  const eventsByLine = new Map<string, typeof events>();
  for (const e of events) {
    const bucket = eventsByLine.get(e.invoiceLineId);
    if (bucket) bucket.push(e);
    else eventsByLine.set(e.invoiceLineId, [e]);
  }
  const requestByLine = new Map(fulfilled.map((r) => [r.fulfilledInvoiceLineId, r]));

  const orderable: OrderableRecord[] = [];
  const toInvoice = (g: InvoiceGroup<(typeof lines)[number] & { projectId: string }>, current: boolean) => {
    const timeline = mergeInvoiceEvents(g.lines.flatMap((l) => eventsByLine.get(l.id) ?? []));
    const raisedIso = firstRaisedAt(timeline);
    const raisedAtDate = raisedIso ? new Date(raisedIso) : null;
    const tier = invoiceTier({ status: g.status, raisedAt: raisedAtDate }, window);
    if (current) orderable.push({ kind: "invoice", id: g.key, tier, sortDate: (tier === 1 ? raisedAtDate : g.invoiceDate) ?? g.createdAt! });
    const request = g.lines.map((l) => requestByLine.get(l.id)).find((r) => r !== undefined);
    const currencies = [...new Set(g.lines.map((l) => l.currency))];
    const statuses = [...new Set(g.lines.map((l) => normalizeStatus(l.status)))];
    const foreign = currencies.length === 1 && currencies[0] !== "INR";
    const first = g.lines[0]!;
    const mixed = statuses.length > 1;
    return {
      key: g.key,
      invoiceNo: g.invoiceNo,
      /** Workflow creation date — never changes when the status does. */
      createdAt: g.createdAt!.toISOString(),
      createdMonth: istMonthOf(g.createdAt!),
      /** The invoice date (date-only); null when no line has a usable one — such an invoice is in no month's report. */
      invoiceDate: g.invoiceDate ? dateOnly(g.invoiceDate) : null,
      /** When recorded history first took it to Raised or beyond; null when none was recorded (never inferred). */
      raisedAt: raisedIso,
      /** Only an invoice dated in the selected month can be "raised this month"; a previous invoice never is. */
      raisedInPeriod: current && tier === 1,
      amountINR: g.amountINR,
      currency: currencies.length === 1 ? currencies[0]! : "Mixed",
      originalAmount: foreign
        ? round2(g.lines.filter((l) => normalizeStatus(l.status) !== "Cancelled").reduce((s, l) => s + (l.invoiceAmountOriginal ?? l.invoiceAmountINR), 0))
        : null,
      status: g.status,
      mixedLineStatuses: mixed,
      paymentStatus: paymentLabel(g.status),
      financials: withDateFlag(financialsOf(g.status, g.amountINR, mixed, hasMixedLiveStatuses(g.lines)), g.invoiceDate === null),
      lines: g.lines.map((l) => ({ id: l.id, quantityItemId: l.quantityItemId, activity: l.quantityItem.description, status: normalizeStatus(l.status), amountINR: l.invoiceAmountINR })),
      // Record metadata only — when/who typed the invoice into the portal; NOT a status event.
      recordedInPortal: { at: first.createdAt.toISOString(), by: first.createdBy },
      hasRecordedHistory: timeline.length > 0,
      timeline,
      // A request is project-level; it is linked to an invoice only when that invoice's raise fulfilled it.
      invoiceRequest: request ? { id: request.id, submittedAt: request.createdAt.toISOString(), submittedBy: request.requestedBy.fullName } : null,
    };
  };
  const invoices = groups.map((g) => toInvoice(g, true));
  const previousInvoices = previousGroups.map((g) => toInvoice(g, false));

  for (const r of requests) orderable.push({ kind: "request", id: r.id, tier: requestTier(), sortDate: r.createdAt });

  const mapRequest = (r: (typeof allRequests)[number]) => ({
    id: r.id,
    /** Requests have no human number, only an id: a short reference for display. */
    ref: shortRequestRef(r.id),
    status: r.status,
    label: REQUEST_LABEL[r.status as keyof typeof REQUEST_LABEL] ?? r.status,
    createdAt: r.createdAt.toISOString(),
    createdMonth: istMonthOf(r.createdAt),
    requestedBy: r.requestedBy.fullName,
    assignedTo: r.assignedTo.fullName,
    /** Free text as typed by the requester — not a number. */
    amountNote: r.invoiceAmountNote,
    notes: r.notes,
    /** The invoice whose raise fulfilled this request (Completed only), and that invoice's date (date-only) so its own month can be found. */
    fulfilledByInvoiceNo: r.fulfilledInvoiceLine?.invoiceNo ?? null,
    fulfilledByInvoiceDate: r.fulfilledInvoiceLine && isValidInvoiceDate(r.fulfilledInvoiceLine.invoiceDate) ? dateOnly(r.fulfilledInvoiceLine.invoiceDate) : null,
  });

  return {
    month,
    project,
    invoices,
    /** Earlier-dated invoices of this project, newest first — shown for billing context, never counted in the month (see above). */
    previousInvoices,
    /** Invoices of this project with no usable invoice date: in no month, listed in All history, flagged for review. */
    undatedInvoiceCount,
    /** The headline: key (into `invoices` / `previousInvoices`) of the latest raised invoice dated up to the month's end; null for All history or none. */
    latestRaisedKey: latest?.key ?? null,
    /** true = dated in the selected month; false = an older one, shown as the latest AVAILABLE; null = no month or none. */
    latestRaisedInMonth: latest && window ? inInvoiceMonth(latest.invoiceDate, window) : null,
    /** Draft invoices dated in the month, newest first. */
    draftKeys: draftGroups.map((g) => g.key),
    /** The previous-invoices table: every other invoice dated up to the month's end, newest first. */
    historyKeys: historyGroups.map((g) => g.key),
    /** Older invoices still outstanding relative to the headline — keys trace the figure to history rows; total null unless fully reliable. */
    olderOutstanding: older,
    /** Display order across both kinds: raised in the month first, then the other records (see the rules' ORDER note). */
    order: orderRecords(orderable),
    /**
     * The project's latest record up to the end of the month — the SAME record the project row shows. `id` is an invoice's key (in
     * `invoices` / `previousInvoices`) or a request's id (in `requests` / `previousRequests`). null = none.
     */
    latestRecord,
    /**
     * EVERY record this view lists — current and earlier invoices (any status) and requests — with the latest record first, then the rest
     * newest first. By record date, then creation instant, then id; an invoice with no usable date comes last.
     */
    recordOrder: orderAllRecords([...groups, ...previousGroups], [...requests, ...previousRequests], latestRecord && { kind: latestRecord.kind, id: latestRecord.id }),
    requests: requests.map(mapRequest),
    /** Requests created before the selected month, newest first within recordOrder — for context, never in the month's totals. */
    previousRequests: previousRequests.map(mapRequest),
  };
}

/**
 * The Outstanding view: every Raised / Partially Paid invoice from ALL original months. Nothing is copied or moved —
 * an invoice stays in its creation month; this is just a cross-month filter on current status. Fully settled (Paid),
 * Draft and Cancelled invoices are excluded. Raised → outstanding is the invoice amount; Partially Paid → the balance
 * is not recorded anywhere, so the row is listed and flagged, never given a guessed figure.
 */
export async function getOutstanding(user: AccessTokenPayload, query: OutstandingQuery, now = new Date()) {
  const base = await scopedBase(user, query);
  const projectIds = await repo.findProjectIdsWithOutstandingLines(base);
  const lines = await repo.findLinesForProjects(projectIds);
  const groups = groupInvoices(lines).filter((g) => {
    const s = normalizeStatus(g.status);
    return s === "Raised" || s === "PartiallyPaid";
  });
  const projects = new Map((await repo.findProjectsByIds(base, projectIds)).map((p) => [p.id, p]));
  // Today in India, formatted ONCE: building a date formatter per row was ~85% of this endpoint's time with ~1,700 invoices.
  const today = zonedToday(now, env.APP_TIMEZONE);

  const rows = groups
    .filter((g) => projects.has(g.projectId))
    .map((g) => {
      const p = projects.get(g.projectId)!;
      const statuses = [...new Set(g.lines.map((l) => normalizeStatus(l.status)))];
      const mixed = statuses.length > 1;
      const fin = financialsOf(g.status, g.amountINR, mixed, hasMixedLiveStatuses(g.lines));
      const earliestLine = g.lines.reduce((a, b) => ((b.invoiceDate ?? a.invoiceDate!) < (a.invoiceDate ?? b.invoiceDate!) ? b : a));
      return {
        projectId: g.projectId,
        prNo: p.prNo,
        client: p.client,
        projectTitle: p.projectTitle,
        projectStatus: p.projectStatus,
        invoiceNo: g.invoiceNo,
        /** Original workflow creation date — unchanged by later payment. */
        createdAt: g.createdAt ? g.createdAt.toISOString() : null,
        createdMonth: g.createdAt ? istMonthOf(g.createdAt) : null,
        invoiceDate: g.invoiceDate ? dateOnly(g.invoiceDate) : null,
        status: g.status,
        paymentStatus: paymentLabel(g.status),
        amountINR: g.amountINR,
        amountPaidINR: fin.amountPaidINR,
        outstandingINR: fin.outstandingINR,
        balance: fin.balance,
        flags: fin.flags,
        /** Calendar days from the invoice date to today in India (the weekly reminder's own rule); 0 for an invoice dated in the future, null with no usable date. */
        daysOutstanding: g.invoiceDate ? Math.max(0, daysFrom(g.invoiceDate, today)) : null,
        lineCount: g.lines.length,
        /** The invoice's earliest line — View / Edit / Delete act on it (single-line invoices) or open the project. */
        actionLine: { id: earliestLine.id, quantityItemId: earliestLine.quantityItemId! },
      };
    });
  rows.sort((a, b) => (b.daysOutstanding ?? -1) - (a.daysOutstanding ?? -1) || prNoCollator.compare(a.prNo, b.prNo) || (a.invoiceNo < b.invoiceNo ? -1 : a.invoiceNo > b.invoiceNo ? 1 : 0));

  const totals = summarizeOutstanding(rows);
  const items = rows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize);
  return {
    asOf: now.toISOString(),
    timezone: env.APP_TIMEZONE,
    totals,
    items,
    page: query.page,
    pageSize: query.pageSize,
    total: rows.length,
    totalPages: totalPagesFor(rows.length, query.pageSize),
  };
}
