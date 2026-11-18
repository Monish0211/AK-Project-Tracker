import { prisma } from "../../../shared/utils/prismaClient.js";
import {
  findResourceByProjectAndEmployee,
  upsertResourceByProjectAndEmployee,
} from "../../resources/repository/resource.repository.js";
import { findEmployeeByEmployeeNo } from "../../employees/repository/employee.repository.js";
import { findEntriesForPair } from "../repository/timesheet.repository.js";
import type { ProjectResourceData } from "../../resources/resource.types.js";
import { regionalSnapshotFields } from "../../manhourRates/manhourSnapshot.js";

/** "YYYY-MM-DD" from a stored workDate — the workDates this module stores are always UTC midnight (see excelParser.service.ts), so UTC getters are the correct read-back. */
function dateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Recomputes ProjectResource for one (employeeNo, projectId) pair — ALWAYS
 * from every current TimesheetEntry row for that pair, NEVER by
 * incrementing whatever ProjectResource already had. Called once per
 * touched pair at the end of timesheet.service.ts's processTimesheetImport(),
 * per the approved Stage 3/4 architecture.
 *
 * Phase 4 / Option A: hourlyRateSnapshot is no longer frozen. The employee's
 * CURRENT saved hourly rate (Employee.manhourExpenses) prices every hour of the
 * row, so the column now means "the rate used by the last costing of this
 * row". It is refreshed here on every recompute and, for all of an employee's
 * rows at once, by the automatic recalculation that runs when that rate
 * changes (manhourCosting/manhourCostRefresh.service.ts). Only when no
 * Employee row exists does the previous value stay (as before, 0 if none).
 *
 * assignmentStatus is deliberately NOT derived from totalHours reaching
 * zero — a correction to 0 hours is a different fact from "this employee
 * was released from the project." It's driven by whichever live entry has
 * the latest workDate's own sourceStatus (most-recent-day-wins); left at
 * its prior value when no live entries remain (a full zero-hour wipe).
 *
 * P1-04 (production hardening) — concurrency-safe. Before this fix, this
 * function was a plain read-entries -> read-existing-row -> create-or-update
 * sequence with no transaction, no lock, and no atomicity: two concurrent
 * calls for the SAME pair (e.g. two overlapping Keka imports, or an import
 * racing a manual entry edit, both touching the same employee+project) could
 * interleave — call A reads a stale, smaller entries set, call B reads a
 * fresher, larger one, B writes its correct totals, then A's still-in-flight
 * write lands afterward and silently overwrites B's correct totals with A's
 * stale ones (a classic lost update). The @@unique([projectId, employeeNo])
 * constraint already prevented a literal duplicate row, but did nothing for
 * this staler-write-wins race.
 *
 * Fixed with the smallest correct DB-native mechanism for this shape of
 * problem: the whole read-compute-write sequence now runs inside one
 * Prisma interactive transaction that first takes a Postgres SESSION-LEVEL
 * advisory transaction lock (`pg_advisory_xact_lock`) keyed by a hash of
 * this exact (projectId, employeeNo) pair. A concurrent recompute call for
 * the SAME pair blocks at that first line until the first transaction
 * commits (the lock auto-releases at commit/rollback) — so the second call
 * always re-reads a fully up-to-date entries snapshot before computing
 * anything, never an interleaved stale one. A concurrent recompute for a
 * DIFFERENT pair hashes to a different lock key and proceeds fully in
 * parallel, unaffected — this does not serialize the whole import, only
 * same-pair recomputes. The final write is also switched from a manual
 * "if (existing) update else create" branch to one atomic
 * `INSERT ... ON CONFLICT DO UPDATE` (upsertResourceByProjectAndEmployee),
 * closing the separate TOCTOU window that plain branch had between deciding
 * "this pair doesn't exist yet" and actually writing it.
 */
export async function recomputeProjectResource(employeeNo: string, projectId: string): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      // Advisory lock key: a single stable string combining both parts of
      // the pair, hashed by Postgres's own hashtext() — collisions across
      // different pairs are theoretically possible (hashtext is 32-bit) but
      // only cost a little unnecessary serialization between two unrelated
      // pairs, never a correctness problem, since the lock is strictly more
      // conservative than required, never less.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${projectId}::${employeeNo}`}))`;

      const [entries, existing] = await Promise.all([
        findEntriesForPair(employeeNo, projectId, tx),
        findResourceByProjectAndEmployee(projectId, employeeNo, tx),
      ]);

      const totalHours = round2(entries.reduce((sum, e) => sum + e.hours, 0));
      const workingDays = new Set(entries.map((e) => dateKey(e.workDate))).size;

      let assignmentStartDate: Date | null;
      let assignmentEndDate: Date | null;
      let assignmentStatus: string;

      if (entries.length > 0) {
        const times = entries.map((e) => e.workDate.getTime()).sort((a, b) => a - b);
        assignmentStartDate = new Date(times[0]!);
        assignmentEndDate = new Date(times[times.length - 1]!);
        const latestEntry = entries.reduce((a, b) => (a.workDate.getTime() >= b.workDate.getTime() ? a : b));
        assignmentStatus = latestEntry.sourceStatus === "Released" ? "Released" : "Active";
      } else {
        // Every TimesheetEntry for this pair was Removed (a zero-hour
        // correction wiped the last remaining row) — preserve the prior
        // historical values rather than nulling/resetting them. Never delete
        // the ProjectResource row itself: it carries the row's costing
        // history (rate used, regional snapshot) for when hours resume.
        assignmentStartDate = existing?.assignmentStartDate ?? null;
        assignmentEndDate = existing?.assignmentEndDate ?? null;
        assignmentStatus = existing?.assignmentStatus ?? "Active";
      }

      // Option A: always the employee's CURRENT saved rate, read on this transaction. No Employee row (never created, or not found): keep what the row had, else 0.
      const employee = await findEmployeeByEmployeeNo(employeeNo, tx);
      const hourlyRateSnapshot = employee ? employee.manhourExpenses : (existing?.hourlyRateSnapshot ?? 0);

      const manhourCost = round2(totalHours * hourlyRateSnapshot);
      // Phase 4 - the regional columns beside the (unchanged) INR cost: converted with the rate version the row already holds, the project's latest
      // version for a brand-new row, or RATE_MISSING. Nothing about how the INR cost or the frozen hourly rate is determined has changed.
      const regional = await regionalSnapshotFields(projectId, manhourCost, existing, tx);

      const createData: ProjectResourceData = {
        employeeNo,
        assignmentStartDate,
        assignmentEndDate,
        assignmentStatus,
        hourlyRateSnapshot,
        workingDays,
        totalHours,
        manhourCost,
        ...regional,
        lastSyncedAt: new Date(),
      };
      // Option A: the rate used is refreshed with every recompute (see the module-level comment above).
      const updateData: Partial<ProjectResourceData> = {
        hourlyRateSnapshot,
        assignmentStartDate,
        assignmentEndDate,
        assignmentStatus,
        workingDays,
        totalHours,
        manhourCost,
        ...regional,
        lastSyncedAt: new Date(),
      };

      await upsertResourceByProjectAndEmployee(tx, projectId, employeeNo, createData, updateData);
    },
    // Same reasoning as timesheet.service.ts's processTimesheetImport() —
    // this transaction can now block on the advisory lock behind a slower
    // concurrent recompute for the same pair, so it needs headroom beyond
    // Prisma's 5000ms default. Recompute itself is cheap (a handful of
    // indexed reads plus one upsert); 30s comfortably covers being queued
    // behind another in-flight recompute for the same pair without being an
    // arbitrarily huge value.
    { timeout: 30_000, maxWait: 10_000 }
  );
}
