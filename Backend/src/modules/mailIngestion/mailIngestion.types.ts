/** Shapes used by the Microsoft Graph mailbox-polling module. */

export interface PollResult {
  messagesFound: number;
  processed: number;
  skippedAlreadyProcessed: number;
  skippedNoAttachment: number;
  errors: string[];
  // Summed across every message's processTimesheetImport() result this poll
  // run touched — lets a caller (the daily scheduler, see
  // shared/scheduler/timesheetPollScheduler.ts) log row-level outcomes
  // without re-deriving them or querying TimesheetImport separately.
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  removedCount: number;
  failedCount: number;
}

/** Minimal fields read from a Graph message — see mailPoll.service.ts's $select. */
export interface GraphMessage {
  id: string;
  subject: string;
  receivedDateTime: string;
  from?: { emailAddress?: { address?: string } };
  hasAttachments: boolean;
}

/** Minimal fields read from a Graph attachment. contentBytes is only populated by Graph for attachments under its inline-size threshold — see mailPoll.service.ts's known-gap note on larger attachments. */
export interface GraphAttachment {
  id: string;
  name: string;
  contentType: string;
  contentBytes?: string;
  size: number;
}
