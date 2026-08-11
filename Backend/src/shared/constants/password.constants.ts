/**
 * The one place the backend defines the default temporary password. Admin
 * Reset Password (modules/users) hashes and sets exactly this value with no
 * client input — change it here and every reset follows.
 *
 * Create User's temporary password is different: the Administrator sees
 * and can edit it client-side before submitting, so the backend just hashes
 * whatever value it's given. The frontend mirrors this same literal value
 * in its own single constant (frontend/src/utils/userProvisioning.ts) so
 * the two stay in sync — keep them equal if this value ever changes.
 */
export const DEFAULT_TEMP_PASSWORD = "Welcome@123";
