/**
 * OUR OWN COMPANY'S IDENTITY — iFluids' own letterhead/footer contact
 * details (email domain, phone, website, GSTIN). Unlike every other piece
 * of knowledge in this pipeline, these are legitimately safe to hardcode:
 * they don't vary per document the way a client's name or scope of work
 * does — iFluids' own phone number is iFluids' own phone number on every
 * proposal it ever issues. Treating them as universal negative matches for
 * client-facing fields (Client Email, Contact Number) is a durable rule,
 * not a shortcut tailored to one sample PDF.
 *
 * Every one of these values can appear ANYWHERE in a document — a footer
 * repeated on every page, a disclaimer block, a letterhead — not only
 * inside a section sectionDetector.ts happens to classify as ignorable.
 * That's why this filter is applied at the value level (see
 * contextMatcher.ts's `matchLabelValueExcluding`/`matchBareRegexExcluding`)
 * rather than relied on to be caught by section scoping alone.
 */

export const OWN_COMPANY_EMAIL_DOMAINS = ["ifluids.com"];
export const OWN_COMPANY_WEBSITES = ["www.ifluids.com", "ifluids.com"];
/** Every known phone number iFluids itself publishes — extend this list if a new office/branch number appears on a letterhead. */
export const OWN_COMPANY_PHONE_NUMBERS = ["+91 44 4265 8747", "044 4265 8747", "4265 8747"];
export const OWN_COMPANY_GSTIN_NUMBERS = ["33AAFFI1423E1Z1"];

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function isOwnCompanyEmail(value: string): boolean {
  const lower = value.toLowerCase();
  return OWN_COMPANY_EMAIL_DOMAINS.some((domain) => lower.includes(`@${domain}`));
}

export function isOwnCompanyPhone(value: string): boolean {
  const normalized = normalizeDigits(value);
  if (normalized.length < 6) return false;
  return OWN_COMPANY_PHONE_NUMBERS.some((known) => {
    const knownDigits = normalizeDigits(known);
    return normalized.endsWith(knownDigits) || knownDigits.endsWith(normalized);
  });
}

export function isOwnCompanyWebsiteMention(value: string): boolean {
  const lower = value.toLowerCase();
  return OWN_COMPANY_WEBSITES.some((site) => lower.includes(site));
}

export function isOwnCompanyGstin(value: string): boolean {
  const upper = value.toUpperCase().replace(/\s/g, "");
  return OWN_COMPANY_GSTIN_NUMBERS.some((known) => upper.includes(known));
}

/** The one entry point contextMatcher.ts's excluding strategies call — `kind` narrows which of the checks above apply, since an email-shaped value should never be rejected for merely containing digits that resemble a phone number, and vice versa. */
export function isOwnCompanyValue(value: string, kind: "email" | "phone" | "any"): boolean {
  if (kind === "email") return isOwnCompanyEmail(value);
  if (kind === "phone") return isOwnCompanyPhone(value);
  return (
    isOwnCompanyEmail(value) || isOwnCompanyPhone(value) || isOwnCompanyWebsiteMention(value) || isOwnCompanyGstin(value)
  );
}
