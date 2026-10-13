import { prisma } from "../../../shared/utils/prismaClient.js";
import { booleanFromEnv, env } from "../../../shared/utils/env.js";
import { sendEmail } from "../../../shared/email/email.service.js";
import { buildPmoCoordinatorAllocatedEmail } from "../../../shared/email/templates/pmoCoordinatorAllocated.template.js";
import type { SendEmailOptions, SendEmailResult } from "../../../shared/email/email.types.js";

/**
 * PMO Coordinator allocation email (Oct 2026).
 *
 * Called by project.service.ts AFTER the save transaction has committed, and
 * only when the project's linked coordinator ACCOUNT actually changed to a
 * new, non-null account (decided inside that transaction under a row lock —
 * see updateProject()/createProject()). The recipient is always the linked
 * PortalUser's own email, never the free-text pmoCoordinator name.
 *
 * Fire-and-forget: this guarantees one ATTEMPT per real assignment change,
 * not delivery — there is no retry or outbox. A failure is logged with the
 * project id and never affects the saved assignment.
 *
 * Gated by PMO_ALLOCATION_EMAIL_ENABLED (default false). Independent of the
 * unfinished Project Notification System and its name-matched recipients.
 */

export type AllocationEmailSender = (options: SendEmailOptions) => Promise<SendEmailResult>;

let senderOverride: AllocationEmailSender | null = null;
let flagOverride: boolean | null = null;

/** Tests only: replace the real sender (so nothing is ever delivered). Pass null to restore. */
export function setAllocationEmailSenderForTests(sender: AllocationEmailSender | null): void {
  senderOverride = sender;
}

/**
 * Tests only: evaluate the switch as if PMO_ALLOCATION_EMAIL_ENABLED were set
 * to `raw` (undefined = missing), using the exact env parsing rule. Pass null
 * to go back to the real environment value.
 */
export function setAllocationEmailFlagForTests(raw: string | undefined | null): void {
  flagOverride = raw === null ? null : booleanFromEnv.parse(raw);
}

export function isAllocationEmailEnabled(): boolean {
  return flagOverride ?? env.PMO_ALLOCATION_EMAIL_ENABLED;
}

export type AllocationEmailOutcome = "disabled" | "no_recipient" | "sent" | "failed";

export interface AllocationChange {
  projectId: string;
  coordinatorUserId: string;
}

export async function sendPmoCoordinatorAllocationEmail(change: AllocationChange): Promise<AllocationEmailOutcome> {
  if (!isAllocationEmailEnabled()) return "disabled";

  const [project, account] = await Promise.all([
    prisma.project.findUnique({
      where: { id: change.projectId },
      select: { id: true, prNo: true, projectTitle: true, client: true },
    }),
    prisma.portalUser.findUnique({
      where: { id: change.coordinatorUserId },
      select: { email: true, fullName: true, isActive: true },
    }),
  ]);
  if (!project || !account || !account.isActive || !account.email.trim()) {
    console.warn(`[pmoCoordinators] Allocation email skipped for project ${change.projectId}: coordinator account unavailable.`);
    return "no_recipient";
  }

  const email = buildPmoCoordinatorAllocatedEmail({
    coordinatorName: account.fullName?.trim() || null,
    prNo: project.prNo,
    projectTitle: project.projectTitle,
    client: project.client?.trim() || null,
    projectUrl: `${env.FRONTEND_URL}/projects/view/${project.id}`,
  });

  const send = senderOverride ?? sendEmail;
  const result = await send({ to: account.email.trim(), subject: email.subject, html: email.html, text: email.text });
  if (!result.success) {
    console.error(`[pmoCoordinators] Allocation email failed for project ${change.projectId}: ${result.error ?? "unknown error"}`);
    return "failed";
  }
  return "sent";
}

/**
 * The after-commit entry point: never awaited by the request, never throws.
 * Returns the promise so tests can await the attempt.
 */
export function notifyPmoCoordinatorAllocated(change: AllocationChange): Promise<AllocationEmailOutcome> {
  return sendPmoCoordinatorAllocationEmail(change).catch((error) => {
    console.error(
      `[pmoCoordinators] Allocation email error for project ${change.projectId}:`,
      error instanceof Error ? error.message : "unknown error"
    );
    return "failed" as const;
  });
}
