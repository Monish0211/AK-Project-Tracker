import { prisma } from "../../../shared/utils/prismaClient.js";
import { projectOwnershipWhereOr } from "../../../shared/utils/projectAccess.js";

/**
 * All Prisma access for the Timesheet Pending calculation lives here — a
 * separate file from timesheet.repository.ts (which is scoped to
 * TimesheetEntry only) since this reads/writes Project as well as
 * TimesheetEntry. Same "no business logic here" rule as every other
 * repository in this module — the actual pending/current decision lives
 * in services/timesheetPending.service.ts.
 */

export interface ActiveProjectForPendingCheck {
  id: string;
  prNo: string;
  projectTitle: string;
  department: string;
  primaryProjectManager: string | null;
  pmoCoordinator: string | null;
  timesheetPendingTrackingStartedAt: Date | null;
}

/**
 * Only Active, non-archived projects participate — matches the existing
 * frontend rule exactly (project.projectStatus === "Active"), not expanded
 * or narrowed. `callerUserId` (undefined for Administrator) additionally
 * scopes results to projects the caller is authorized for — the same
 * project-ownership rule as GET /projects, never a second concept (see
 * shared/utils/projectAccess.ts's projectOwnershipWhereOr()).
 */
// P2-01 (production hardening) — a defensive fetch bound, not a claim that
// this many active projects is expected. Same "CAP + 1 so the caller can
// tell 'exactly CAP rows' apart from 'there are MORE than CAP and this
// silently dropped some'" reasoning as dashboard.repository.ts's own
// DASHBOARD_PROJECT_FETCH_CAP (both are called together inside
// getDashboardSummary(), so both share the same cap value for consistency)
// — see timesheetPending.service.ts's own overflow check, which throws
// rather than ever silently returning an incomplete Pending calculation.
export const TIMESHEET_PENDING_PROJECT_FETCH_CAP = 50_000;

export function findActiveProjectsForPendingCheck(callerUserId?: string): Promise<ActiveProjectForPendingCheck[]> {
  const ownershipOr = projectOwnershipWhereOr(callerUserId);
  return prisma.project.findMany({
    where: {
      isDeleted: false,
      projectStatus: "Active",
      ...(ownershipOr && { AND: [{ OR: ownershipOr }] }),
    },
    select: {
      id: true,
      prNo: true,
      projectTitle: true,
      department: true,
      primaryProjectManager: true,
      pmoCoordinator: true,
      timesheetPendingTrackingStartedAt: true,
    },
    take: TIMESHEET_PENDING_PROJECT_FETCH_CAP + 1,
  });
}

export interface LatestWorkDateByProject {
  projectId: string;
  latestWorkDate: Date;
}

/**
 * The single latest TimesheetEntry.workDate per project, for every project
 * id given, in ONE query — never one query per project (N+1). Cancelled/
 * released status is irrelevant here: per the confirmed business rule, any
 * TimesheetEntry at all for the project counts, regardless of who logged
 * it or its sourceStatus.
 */
export async function findLatestWorkDatesByProjectIds(projectIds: string[]): Promise<LatestWorkDateByProject[]> {
  if (projectIds.length === 0) {
    return [];
  }

  const grouped = await prisma.timesheetEntry.groupBy({
    by: ["projectId"],
    where: { projectId: { in: projectIds } },
    _max: { workDate: true },
  });

  return grouped
    .filter((row): row is typeof row & { projectId: string; _max: { workDate: Date } } => row.projectId !== null && row._max.workDate !== null)
    .map((row) => ({ projectId: row.projectId, latestWorkDate: row._max.workDate }));
}

/**
 * Sets the tracking-start date the first time a project is found to have
 * zero TimesheetEntry rows. One updateMany for every unset project in this
 * request — still guarded by `timesheetPendingTrackingStartedAt: null` so
 * concurrent GETs cannot reset an already-set date.
 */
export function setTrackingStartDatesIfUnset(projectIds: string[], date: Date): Promise<{ count: number }> {
  if (projectIds.length === 0) {
    return Promise.resolve({ count: 0 });
  }

  return prisma.project.updateMany({
    where: { id: { in: projectIds }, timesheetPendingTrackingStartedAt: null },
    data: { timesheetPendingTrackingStartedAt: date },
  });
}
