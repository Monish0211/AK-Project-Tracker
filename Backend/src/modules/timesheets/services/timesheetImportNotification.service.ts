import { notify, resolveModuleRecipients } from "../../notifications/notification.service.js";
import type { ProcessImportResult } from "../timesheet.types.js";

/**
 * Priority #6 Phase 3B — the ONE notification for a completed Timesheet
 * import (Keka email or Administrator manual upload). Deliberately its own
 * file, separate from timesheet.service.ts: this only ever runs AFTER
 * processTimesheetImport() has already resolved and returned its final
 * ProcessImportResult — it never touches identityKey()/decideEntryOutcome()/
 * the reconciliation transaction, and is never called from inside
 * processTimesheetImport() itself. Called from its two real callers instead
 * (mailPoll.service.ts's poll loop, timesheet.controller.ts's manual-upload
 * handler) — see each call site's own comment for why.
 *
 * One call = one notification, driven 1:1 by the already-created
 * TimesheetImport row's own id — never one per TimesheetEntry. Duplicate
 * protection is structural, not something this file has to implement itself:
 * a Keka email can never be processed twice (TimesheetImport.emailMessageId
 * is unique, and mailPoll.service.ts already skips/never re-calls
 * processTimesheetImport for an already-recorded message), and a manual
 * upload always creates a genuinely new TimesheetImport row, so two manual
 * uploads are two real, separately-intentional events, not duplicates of one
 * another.
 */
export async function notifyTimesheetImportOutcome(
  result: ProcessImportResult,
  source: "Keka" | "Manual"
): Promise<void> {
  const recipients = await resolveModuleRecipients("Timesheets");
  if (recipients.length === 0) return;

  const label = source === "Keka" ? "Keka Timesheet Import" : "Manual Timesheet Import";
  const summary = `${result.totalRows} rows processed: ${result.createdCount} created, ${result.updatedCount} updated, ${result.unchangedCount} unchanged.`;

  if (result.status === "Succeeded") {
    await notify(recipients, {
      title: `${label} Completed`,
      message: summary,
      type: "TIMESHEET_IMPORT_COMPLETED",
      severity: "Info",
      entityType: "TimesheetImport",
      entityId: result.importId,
    });
    return;
  }

  if (result.status === "PartiallySucceeded") {
    await notify(recipients, {
      title: `${label} Partially Completed`,
      message: `${summary} ${result.failedCount} row(s) failed.`,
      type: "TIMESHEET_IMPORT_PARTIAL",
      severity: "Medium",
      entityType: "TimesheetImport",
      entityId: result.importId,
    });
    return;
  }

  await notify(recipients, {
    title: `${label} Failed`,
    message: result.errorSummary ?? `${label} failed.`,
    type: "TIMESHEET_IMPORT_FAILED",
    severity: "High",
    entityType: "TimesheetImport",
    entityId: result.importId,
  });
}

/**
 * Backs the Keka-only case where a message failed before any TimesheetImport
 * row could even be created (e.g. attachment validation/parse failure —
 * see mailPoll.service.ts's per-message catch block). Never invents an
 * entityId for a row that doesn't exist — entityId is genuinely null here,
 * exactly as the approved Phase 3B design requires.
 */
export async function notifyKekaImportFailedBeforeImportRow(errorMessage: string): Promise<void> {
  const recipients = await resolveModuleRecipients("Timesheets");
  if (recipients.length === 0) return;

  await notify(recipients, {
    title: "Keka Timesheet Import Failed",
    message: errorMessage,
    type: "TIMESHEET_IMPORT_FAILED",
    severity: "High",
    entityType: "TimesheetImport",
    entityId: null,
  });
}
