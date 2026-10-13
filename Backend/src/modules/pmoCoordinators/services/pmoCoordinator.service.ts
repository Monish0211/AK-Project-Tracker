import { Prisma } from "../../../../generated/prisma/client.js";
import { AppError } from "../../../shared/utils/AppError.js";
import * as repo from "../repository/pmoCoordinator.repository.js";
import type { PmoCoordinatorRow } from "../repository/pmoCoordinator.repository.js";
import {
  classifyCoordinatorEligibility,
  normalizeCoordinatorEmail,
  PMO_COORDINATOR_STATUS_MESSAGES,
  type CoordinatorEligibility,
} from "./pmoCoordinatorEligibility.rules.js";
import type { CreatePmoCoordinatorInput, UpdatePmoCoordinatorInput } from "../validators/pmoCoordinator.validators.js";

/**
 * Settings → PMO Coordinators — the registry of approved coordinators.
 *
 * Never creates, edits, or grants anything on a PortalUser: accounts are only
 * READ, to compute each entry's eligibility live on every request (nothing
 * about the account is copied into the registry). Never changes any
 * project's coordinator assignment either — that is project editing.
 */

export interface PmoCoordinatorDto {
  id: string;
  displayName: string;
  email: string;
  status: CoordinatorEligibility["status"];
  reasons: CoordinatorEligibility["reasons"];
  account: { id: string; fullName: string } | null;
  matchingAccountCount: number;
  /** Projects (archived included) assigned to the resolved account(s); removal is blocked while > 0. */
  assignedProjectCount: number;
  createdAt: Date;
  updatedAt: Date;
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function toDtos(rows: PmoCoordinatorRow[]): Promise<PmoCoordinatorDto[]> {
  const accounts = await repo.findAccountsByNormalizedEmails([...new Set(rows.map((r) => r.emailNormalized))]);
  const assigned = await repo.countAssignedProjectsByAccount(accounts.map((a) => a.id));

  return rows.map((row) => {
    const matches = accounts.filter((a) => a.emailNormalized === row.emailNormalized);
    const eligibility = classifyCoordinatorEligibility(
      matches.map(({ id, fullName, isActive, accountLocked, hasProjectsModule }) => ({
        id,
        fullName,
        isActive,
        accountLocked,
        hasProjectsModule,
      }))
    );
    return {
      id: row.id,
      displayName: row.displayName,
      email: row.email,
      status: eligibility.status,
      reasons: eligibility.reasons,
      account: eligibility.account ? { id: eligibility.account.id, fullName: eligibility.account.fullName } : null,
      matchingAccountCount: eligibility.matchingAccountCount,
      assignedProjectCount: matches.reduce((sum, a) => sum + (assigned.get(a.id) ?? 0), 0),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });
}

async function toDto(row: PmoCoordinatorRow): Promise<PmoCoordinatorDto> {
  return (await toDtos([row]))[0]!;
}

export async function listPmoCoordinators(): Promise<PmoCoordinatorDto[]> {
  return toDtos(await repo.findAllPmoCoordinators());
}

function duplicateError(email: string, existing: PmoCoordinatorRow | null): AppError {
  return new AppError(
    existing
      ? `"${email}" is already registered as a PMO Coordinator ("${existing.displayName}", ${existing.email}).`
      : `"${email}" is already registered as a PMO Coordinator.`,
    409
  );
}

/** Registers an entry even when no PMO Portal account exists for the email yet (it shows as "no_account"). */
export async function createPmoCoordinator(
  input: CreatePmoCoordinatorInput,
  createdByUserId: string
): Promise<PmoCoordinatorDto> {
  const emailNormalized = normalizeCoordinatorEmail(input.email);
  const existing = await repo.findPmoCoordinatorByNormalizedEmail(emailNormalized);
  if (existing) throw duplicateError(input.email, existing);

  try {
    const created = await repo.createPmoCoordinator({
      displayName: input.displayName,
      email: input.email,
      emailNormalized,
      createdByUserId,
    });
    return toDto(created);
  } catch (error) {
    // A concurrent add of the same email won the unique index race.
    if (isUniqueConstraintViolation(error)) {
      throw duplicateError(input.email, await repo.findPmoCoordinatorByNormalizedEmail(emailNormalized));
    }
    throw error;
  }
}

function assignedProjectsPhrase(outcome: { activeProjects: number; archivedProjects: number }): string {
  return [
    outcome.activeProjects ? `${outcome.activeProjects} active project(s)` : null,
    outcome.archivedProjects ? `${outcome.archivedProjects} archived project(s)` : null,
  ]
    .filter(Boolean)
    .join(" and ");
}

/**
 * Rename and/or change the email. A new email (after normalization) may not
 * collide with another entry, and is refused while any project — active or
 * archived — is assigned to the account the CURRENT email resolves to.
 */
export async function updatePmoCoordinator(id: string, input: UpdatePmoCoordinatorInput): Promise<PmoCoordinatorDto> {
  const emailNormalized = input.email !== undefined ? normalizeCoordinatorEmail(input.email) : undefined;
  if (input.email !== undefined && emailNormalized !== undefined) {
    const conflict = await repo.findPmoCoordinatorByNormalizedEmail(emailNormalized);
    if (conflict && conflict.id !== id) throw duplicateError(input.email, conflict);
  }

  let outcome: Awaited<ReturnType<typeof repo.updatePmoCoordinatorGuarded>>;
  try {
    outcome = await repo.updatePmoCoordinatorGuarded(id, {
      ...(input.displayName !== undefined && { displayName: input.displayName }),
      ...(input.email !== undefined && emailNormalized !== undefined && { email: input.email, emailNormalized }),
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error) && input.email !== undefined && emailNormalized !== undefined) {
      throw duplicateError(input.email, await repo.findPmoCoordinatorByNormalizedEmail(emailNormalized));
    }
    throw error;
  }

  if (outcome.kind === "not_found") throw new AppError("PMO Coordinator not found.", 404);
  if (outcome.kind === "blocked") {
    throw new AppError(
      `The email cannot be changed while this PMO Coordinator is assigned to ${assignedProjectsPhrase(outcome)}. Reassign those projects first.`,
      409
    );
  }
  return toDto(outcome.value);
}

export async function removePmoCoordinator(id: string): Promise<void> {
  const outcome = await repo.removePmoCoordinatorIfUnassigned(id);
  if (outcome.kind === "not_found") throw new AppError("PMO Coordinator not found.", 404);
  if (outcome.kind === "blocked") {
    throw new AppError(
      `This PMO Coordinator is still assigned to ${assignedProjectsPhrase(outcome)}. Reassign those projects before removing them.`,
      409
    );
  }
}

/**
 * The General Information picker's list (GET /projects/pmo-coordinators,
 * any Projects-module user). Narrower than the Settings list: no assignment
 * counts or account names — only what the picker and its "PMO Account Not
 * Available" popup show, plus the resolved account id so the form can
 * pre-select the project's current coordinator.
 */
export interface PmoCoordinatorOptionDto {
  id: string;
  displayName: string;
  email: string;
  status: CoordinatorEligibility["status"];
  statusMessage: string;
  selectable: boolean;
  accountId: string | null;
}

export async function listPmoCoordinatorOptions(): Promise<PmoCoordinatorOptionDto[]> {
  const items = await listPmoCoordinators();
  return items.map((item) => ({
    id: item.id,
    displayName: item.displayName,
    email: item.email,
    status: item.status,
    statusMessage: PMO_COORDINATOR_STATUS_MESSAGES[item.status],
    selectable: item.status === "eligible",
    accountId: item.account?.id ?? null,
  }));
}

/**
 * Save-time revalidation for a project's coordinator (create and edit),
 * inside the caller's transaction. The registry entry is locked FOR SHARE so
 * a concurrent removal or email edit cannot interleave. Eligibility is
 * checked only when the assignment actually changes: re-saving a project
 * whose current coordinator has since become ineligible (e.g. locked) must
 * not block editing unrelated fields.
 */
export async function resolveCoordinatorAssignment(
  tx: Parameters<typeof repo.findEntryWithAccountsForAssignment>[0],
  entryId: string,
  currentAccountId: string | null
): Promise<{ accountId: string; displayName: string }> {
  const found = await repo.findEntryWithAccountsForAssignment(tx, entryId);
  if (!found) {
    throw new AppError("The selected PMO Coordinator is no longer registered. Choose another coordinator.", 400);
  }
  const eligibility = classifyCoordinatorEligibility(found.accounts);
  const accountId = eligibility.account?.id ?? null;
  if (accountId !== null && accountId === currentAccountId) {
    return { accountId, displayName: found.entry.displayName };
  }
  if (eligibility.status !== "eligible" || accountId === null) {
    throw new AppError(
      `"${found.entry.displayName}" cannot be assigned as PMO Coordinator: ${PMO_COORDINATOR_STATUS_MESSAGES[eligibility.status]}`,
      400
    );
  }
  return { accountId, displayName: found.entry.displayName };
}

/**
 * PR Request drafts (Oct 2026): rejects a coordinator entry that is missing
 * or not assignable, with the same message the project save would give. A
 * draft only stores the entry id; the account is linked when the request is
 * approved, where createProject() re-validates it (eligibility can change in
 * between).
 */
export async function assertCoordinatorEntryAssignable(entryId: string): Promise<void> {
  await repo.runRegistryTransaction((tx) => resolveCoordinatorAssignment(tx, entryId, null));
}
