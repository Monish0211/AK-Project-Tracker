import { AppError } from "../../../shared/utils/AppError.js";
import * as repo from "../repository/missingExpense.repository.js";
import { normalizeEmail, validateRecipients } from "../missingExpense.rules.js";

/**
 * Recipient settings shared by every weekly notification (Settings → Weekly
 * Emails). Each notification has its own NotificationSetting row (by `key`)
 * and its own code defaults, used until an administrator first saves.
 */

export interface CcRecipientView {
  email: string;
  portalUserId: string | null;
  userName: string | null;
  userActive: boolean | null;
}

export interface RecipientsView {
  toEmail: string;
  cc: CcRecipientView[];
  /** true until an administrator first saves the settings. */
  isDefault: boolean;
  /** Requested default recipients with no matching PMO Portal user (never guessed). */
  unresolvedDefaults: string[];
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface RecipientDefaults {
  toEmail: string;
  ccEmails: readonly string[];
  unresolved: readonly string[];
}

export interface UpdateRecipientsInput {
  toEmail: string;
  cc: { email?: string | undefined; portalUserId?: string | null | undefined }[];
}

export async function getRecipients(key: string, defaults: () => Promise<RecipientDefaults> | RecipientDefaults): Promise<RecipientsView> {
  const setting = await repo.findSetting(key);
  if (setting) {
    return {
      toEmail: setting.toEmail,
      cc: setting.ccRecipients.map((c) => ({
        email: c.portalUser?.email ?? c.email,
        portalUserId: c.portalUserId,
        userName: c.portalUser?.fullName ?? null,
        userActive: c.portalUser ? c.portalUser.isActive : null,
      })),
      isDefault: false,
      unresolvedDefaults: [],
      updatedAt: setting.updatedAt.toISOString(),
      updatedBy: setting.updatedBy?.fullName ?? null,
    };
  }
  const d = await defaults();
  // A default CC equal to the default To (or repeated) is dropped, never sent twice.
  const seen = new Set([normalizeEmail(d.toEmail)]);
  const ccEmails = d.ccEmails.filter((e) => {
    const k = normalizeEmail(e);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const users = await repo.findUsersByEmails(ccEmails.map(normalizeEmail));
  const byEmail = new Map(users.map((u) => [normalizeEmail(u.email), u]));
  return {
    toEmail: d.toEmail,
    cc: ccEmails.map((email) => {
      const u = byEmail.get(normalizeEmail(email));
      return { email: u?.email ?? email, portalUserId: u?.id ?? null, userName: u?.fullName ?? null, userActive: u ? u.isActive : null };
    }),
    isDefault: true,
    unresolvedDefaults: [...d.unresolved],
    updatedAt: null,
    updatedBy: null,
  };
}

/**
 * Saves the To address and the full CC list. A CC entry picked from PMO
 * Portal users carries portalUserId: its address is taken from that user's
 * stored record (the client-sent email is ignored), and the user must exist
 * and be active. Typed entries are validated as email addresses. Duplicates
 * (including a CC equal to the To address) are rejected.
 */
export async function updateRecipients(
  key: string,
  input: UpdateRecipientsInput,
  updatedByUserId: string,
  logPrefix: string,
  defaults: () => Promise<RecipientDefaults> | RecipientDefaults
): Promise<RecipientsView> {
  const userIds = [...new Set(input.cc.map((c) => c.portalUserId).filter((id): id is string => Boolean(id)))];
  const users = await repo.findUsersByIds(userIds);
  const userById = new Map(users.map((u) => [u.id, u]));

  const entries: { email: string; portalUserId: string | null }[] = [];
  for (const c of input.cc) {
    if (c.portalUserId) {
      const u = userById.get(c.portalUserId);
      if (!u) throw new AppError("A selected CC user no longer exists. Refresh and try again.", 400);
      if (!u.isActive) throw new AppError(`${u.email} is an inactive PMO Portal user and cannot be added as a CC recipient.`, 400);
      entries.push({ email: u.email, portalUserId: u.id });
    } else {
      entries.push({ email: (c.email ?? "").trim(), portalUserId: null });
    }
  }

  const checked = validateRecipients({ toEmail: input.toEmail, ccEmails: entries.map((e) => e.email) });
  if (!checked.ok) throw new AppError(checked.message, 400);
  if (entries.some((e) => !e.email)) throw new AppError("A CC recipient is missing an email address.", 400);

  await repo.saveSetting(
    key,
    checked.toEmail,
    entries.map((e) => ({ email: e.email, emailNormalized: normalizeEmail(e.email), portalUserId: e.portalUserId })),
    updatedByUserId
  );
  console.log(`${logPrefix} Recipients updated by user ${updatedByUserId} — To + ${entries.length} CC.`);
  return getRecipients(key, defaults);
}

export async function listUserOptions() {
  const users = await repo.findActiveUsersForPicker();
  return users.map((u) => ({ id: u.id, fullName: u.fullName, email: u.email, role: u.role?.name ?? null }));
}

/** Addresses actually used for a send: linked users' current emails; inactive linked users are skipped. */
export async function resolveSendRecipients(
  key: string,
  defaults: () => Promise<RecipientDefaults> | RecipientDefaults,
  logPrefix: string
): Promise<{ to: string; cc: string[] }> {
  const view = await getRecipients(key, defaults);
  const cc: string[] = [];
  for (const c of view.cc) {
    if (c.portalUserId && c.userActive === false) {
      console.warn(`${logPrefix} Skipping CC ${c.email} — the linked PMO Portal user is inactive.`);
      continue;
    }
    cc.push(c.email);
  }
  return { to: view.toEmail, cc };
}
