/**
 * PAYMENT MILESTONE DETECTOR — recognizes the payment-terms language real
 * proposals/work orders actually use: a dash-separated "Name - X%", the
 * reverse "X% - Name", and the common prose form "X% on <event>" (e.g.
 * "80% on submission of the draft report.") — plus the standard milestone
 * vocabulary (Advance, Retention, Submission, Completion, Warranty) used
 * to help recognize the right section even when its heading is generic.
 * Bullet markers (iFluids' own proposals use "➢" throughout) are stripped
 * before matching so they don't get captured as part of a milestone name.
 */

export interface RawMilestone {
  milestoneName: string;
  paymentPercentage: string;
  dueDate: string;
  matchType: "context-match";
}

const BULLET_PREFIX = /^[➢➤•\-*·]\s*/;

const MILESTONE_LINE_PATTERNS: Array<{ pattern: RegExp; nameGroup: number; percentGroup: number }> = [
  { pattern: /^(\d{1,3}(?:\.\d+)?)\s*%\s+on\s+(.{3,80})$/i, nameGroup: 2, percentGroup: 1 }, // "80% on submission of the draft report."
  { pattern: /^(.{3,60}?)\s*[-:]\s*(\d{1,3}(?:\.\d+)?)\s*%/, nameGroup: 1, percentGroup: 2 }, // "Mobilization Advance - 30%"
  { pattern: /^(\d{1,3}(?:\.\d+)?)\s*%\s*[-:]?\s*(.{3,60})$/, nameGroup: 2, percentGroup: 1 }, // "30% - Mobilization Advance"
];

const DATE_TOKEN_PATTERN =
  /\b(\d{1,2}[/\-][A-Za-z0-9]{1,4}[/\-]\d{2,4}|\d{4}-\d{2}-\d{2}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})\b/;

function cleanMilestoneName(raw: string): string {
  const trimmed = raw.trim().replace(/\.$/, "");
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function detectPaymentMilestones(searchText: string): RawMilestone[] {
  const milestones: RawMilestone[] = [];

  for (const rawLine of searchText.split("\n")) {
    const line = rawLine.trim().replace(BULLET_PREFIX, "");
    if (!line) continue;

    for (const { pattern, nameGroup, percentGroup } of MILESTONE_LINE_PATTERNS) {
      const match = line.match(pattern);
      if (!match) continue;

      const name = match[nameGroup];
      const percent = match[percentGroup];
      if (!name || !percent) continue;

      const dateMatch = line.match(DATE_TOKEN_PATTERN);
      milestones.push({
        milestoneName: cleanMilestoneName(name),
        paymentPercentage: percent,
        dueDate: dateMatch ? dateMatch[1] : "",
        matchType: "context-match",
      });
      break;
    }
  }

  return milestones;
}
