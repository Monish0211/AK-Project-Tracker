/** Shapes used by the Microsoft Graph mailbox-polling module. */

export interface PollResult {
  messagesFound: number;
  processed: number;
  skippedAlreadyProcessed: number;
  skippedNoAttachment: number;
  errors: string[];
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
