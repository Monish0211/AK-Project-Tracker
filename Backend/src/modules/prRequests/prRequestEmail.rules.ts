import { MANDATORY_PR_REQUEST_CC_EMAIL } from "../../shared/email/email.constants.js";

/**
 * Who a PR Request approval email goes to - the pure recipient rule, applied by the ONE function every such email leaves from
 * (sendPRRequestEmail in prRequest.service.ts). The workflow's own recipient (Accounts approver, PMO Manager or requester) is always the To,
 * exactly as before. The mandatory CC is added by the server, never chosen in the app, and is left out only when that same person is already the
 * To - compared trimmed and ignoring letter case - so nobody ever receives one email twice.
 */
export const sameEmailAddress = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

export function buildPRRequestRecipients(primaryEmail: string, mandatoryCc: string = MANDATORY_PR_REQUEST_CC_EMAIL): { to: string; cc?: string[] } {
  return sameEmailAddress(primaryEmail, mandatoryCc) ? { to: primaryEmail } : { to: primaryEmail, cc: [mandatoryCc] };
}
