/**
 * Additional CC Email Addresses (Oct 2026) — what the Request Invoice form checks BEFORE sending. The server (Backend invoiceRequestEmail.rules.ts)
 * applies the same rules again to every request and is the one that counts; this only gives an immediate, specific message and tidies what is sent.
 * Addresses are trimmed, lower-cased and de-duplicated; one plain address each (no names, quotes, lists or line breaks).
 */

export const MAX_ADDITIONAL_CC_EMAILS = 10;

/**
 * The mandatory CC the server always adds to the "Invoice Request Assigned" email (Backend MANDATORY_INVOICE_REQUEST_CC_EMAIL); typing it again is
 * harmless and is simply not repeated. Only this form uses this helper. The "Invoice Paid" email has its own server-side mandatory address
 * (info@ifluids.com) and is not configured here; info@ifluids.com is an ordinary, selectable address in this form.
 */
export const MANDATORY_CC_EMAIL = "arun@ifluids.com";

const EMAIL_ADDRESS = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

/** The address trimmed and lower-cased, or null when it is not one plain, valid address. */
export function normalizeCcEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length === 0 || email.length > 254 || !EMAIL_ADDRESS.test(email)) return null;
  const local = email.slice(0, email.lastIndexOf("@"));
  if (local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return null;
  const tld = email.slice(email.lastIndexOf(".") + 1);
  if (!/^[a-z]{2,63}$/.test(tld) && !/^xn--[a-z0-9-]{1,59}$/.test(tld)) return null;
  return email;
}

/** Splits typed or pasted text into separate entries: commas, semicolons, spaces and line breaks all separate addresses. */
export function splitEmailInput(text: string): string[] {
  return text.split(/[\s,;]+/).filter((part) => part.length > 0);
}

/** An entry shown back to the user in a message: control characters removed, shortened. */
const shown = (value: string): string =>
  Array.from(value, (ch) => (ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f ? " " : ch))
    .join("")
    .trim()
    .slice(0, 60);

/**
 * Adds what the user typed or pasted to the current list. Valid new addresses are added (lower-cased); duplicates — including of an address
 * already in the list or of the mandatory arun@ifluids.com — are quietly skipped; invalid ones are reported by name and not added; past the maximum nothing
 * more is added. Never throws, never mutates its input.
 */
export function addCcEmails(current: readonly string[], rawInput: string): { emails: string[]; errors: string[] } {
  const emails = [...current];
  const errors: string[] = [];
  const seen = new Set(emails.map((e) => e.toLowerCase()));
  seen.add(MANDATORY_CC_EMAIL.trim().toLowerCase());
  for (const entry of splitEmailInput(rawInput)) {
    const email = normalizeCcEmail(entry);
    if (!email) {
      errors.push(`"${shown(entry)}" is not a valid email address.`);
      continue;
    }
    if (seen.has(email)) continue;
    if (emails.length >= MAX_ADDITIONAL_CC_EMAILS) {
      errors.push(`You can add at most ${MAX_ADDITIONAL_CC_EMAILS} additional CC addresses. "${email}" was not added.`);
      continue;
    }
    seen.add(email);
    emails.push(email);
  }
  return { emails, errors };
}
