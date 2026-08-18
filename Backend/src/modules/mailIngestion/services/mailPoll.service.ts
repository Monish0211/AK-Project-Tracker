import { AppError } from "../../../shared/utils/AppError.js";
import { env } from "../../../shared/utils/env.js";
import { findImportByEmailMessageId } from "../../timesheets/repository/timesheetImport.repository.js";
import { parseTimesheetWorkbook, validateAttachment } from "../../timesheets/services/excelParser.service.js";
import { processTimesheetImport } from "../../timesheets/services/timesheet.service.js";
import { getGraphAccessToken, isGraphConfigured } from "./graphAuth.service.js";
import type { GraphAttachment, GraphMessage, PollResult } from "../mailIngestion.types.js";

/**
 * Mailbox polling — server-side only, no dependency on any user's browser
 * or PC being on. Calls the exact same processTimesheetImport() engine as
 * the Administrator manual-upload path (see timesheet.controller.ts); the
 * only difference is the `triggeredBy: "EmailPoll"` metadata and the real
 * emailMessageId/attachmentId this function fills in from Graph.
 *
 * NOT YET VERIFIED against a real KEKA mailbox — see graphAuth.service.ts's
 * own note. This function has been exercised only for its control flow
 * (unconfigured-Graph short-circuit); it has never successfully called the
 * real Microsoft Graph API, since no tenant credentials exist in this
 * environment yet.
 */

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

async function graphFetch<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${GRAPH_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Graph request failed (${response.status} ${response.statusText}): ${body.slice(0, 500)}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Finds candidate KEKA emails within a lookback window (Decision 9 — never
 * just "today"), skips any already recorded in TimesheetImport
 * (emailMessageId is unique — this IS the duplicate-email guard, a
 * different concern from the row-level reconciliation inside
 * processTimesheetImport), downloads the matching attachment, and hands it
 * to the shared engine. One message failing (a parse error, a missing
 * attachment, a transient Graph error) never stops the rest of the batch —
 * Stage 4 §16 step 9.
 */
export async function pollKekaMailbox(): Promise<PollResult> {
  if (!isGraphConfigured()) {
    throw new AppError(
      "Microsoft Graph is not configured — set MICROSOFT_TENANT_ID/MICROSOFT_CLIENT_ID/MICROSOFT_CLIENT_SECRET/KEKA_MAILBOX/KEKA_SENDER_EMAIL/KEKA_ATTACHMENT_NAME in Backend/.env.",
      503
    );
  }

  const result: PollResult = {
    messagesFound: 0,
    processed: 0,
    skippedAlreadyProcessed: 0,
    skippedNoAttachment: 0,
    errors: [],
    createdCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    removedCount: 0,
    failedCount: 0,
  };

  const token = await getGraphAccessToken();

  const lookbackDate = new Date();
  lookbackDate.setDate(lookbackDate.getDate() - env.KEKA_POLL_LOOKBACK_DAYS);

  const filter = `receivedDateTime ge ${lookbackDate.toISOString()} and from/emailAddress/address eq '${env.KEKA_SENDER_EMAIL}'`;
  const mailbox = encodeURIComponent(env.KEKA_MAILBOX!);

  const messagesResponse = await graphFetch<{ value: GraphMessage[] }>(
    `/users/${mailbox}/messages?$filter=${encodeURIComponent(filter)}&$select=id,subject,receivedDateTime,from,hasAttachments&$top=50`,
    token
  );

  const messages = messagesResponse.value ?? [];
  result.messagesFound = messages.length;

  for (const message of messages) {
    try {
      // Subject matching is a plain, configurable, case-insensitive
      // substring check — the real KEKA subject line is unconfirmed
      // (Decision 8/10), so this is deliberately not a regex or an assumed
      // fixed string. An unset KEKA_SUBJECT_PATTERN matches on sender alone.
      if (env.KEKA_SUBJECT_PATTERN && !message.subject?.toLowerCase().includes(env.KEKA_SUBJECT_PATTERN.toLowerCase())) {
        continue;
      }

      const existingImport = await findImportByEmailMessageId(message.id);
      if (existingImport) {
        result.skippedAlreadyProcessed++;
        continue;
      }

      if (!message.hasAttachments) {
        result.skippedNoAttachment++;
        continue;
      }

      const attachmentsResponse = await graphFetch<{ value: GraphAttachment[] }>(
        `/users/${mailbox}/messages/${message.id}/attachments`,
        token
      );

      const attachment = (attachmentsResponse.value ?? []).find((a) =>
        a.name?.toLowerCase().includes(env.KEKA_ATTACHMENT_NAME!.toLowerCase())
      );

      // KNOWN GAP: Graph only returns `contentBytes` inline for attachments
      // under its own size threshold (historically ~3MB) via this
      // endpoint — a larger real KEKA file would need the `$value`
      // streaming endpoint instead, not yet implemented (real attachment
      // size is unverified — Stage 4 §7 open question).
      if (!attachment || !attachment.contentBytes) {
        result.skippedNoAttachment++;
        continue;
      }

      const bytes = Buffer.from(attachment.contentBytes, "base64");
      validateAttachment(attachment.name, bytes);
      const parsed = parseTimesheetWorkbook(bytes);

      // The TimesheetImport row is only created (inside
      // processTimesheetImport, via createImport) once these bytes are
      // already fully downloaded and parsed — a network/Graph failure
      // before this point leaves no trace at all, so the next poll cycle
      // naturally retries this same message (Stage 4 §15's idempotent-
      // retry design).
      const importResult = await processTimesheetImport(parsed.rows, {
        triggeredBy: "EmailPoll",
        emailMessageId: message.id,
        attachmentId: attachment.id,
        attachmentFilename: attachment.name,
        receivedAt: new Date(message.receivedDateTime),
      });

      result.processed++;
      result.createdCount += importResult.createdCount;
      result.updatedCount += importResult.updatedCount;
      result.unchangedCount += importResult.unchangedCount;
      result.removedCount += importResult.removedCount;
      result.failedCount += importResult.failedCount;
    } catch (err) {
      const messageText = err instanceof Error ? err.message : "Unknown error.";
      result.errors.push(`Message ${message.id}: ${messageText}`);
    }
  }

  return result;
}
