import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { env } from "../../shared/utils/env.js";
import { hashToken } from "../../shared/utils/token.util.js";
import { comparePassword } from "../../shared/utils/password.util.js";
import {
  FORGOT_PASSWORD_RATE_LIMIT_MAX_REQUESTS,
  LOGIN_RATE_LIMIT_MAX_REQUESTS,
  RESET_TOKEN_RATE_LIMIT_MAX_REQUESTS,
} from "../../shared/middleware/authRateLimit.js";

/**
 * P1 — per-IP rate limiting on the unauthenticated Auth endpoints. Each
 * limiter (`loginRateLimit`, `forgotPasswordRateLimit`, `resetTokenRateLimit`)
 * is its own independent module-level counter (see authRateLimit.ts), so
 * the three `test()` blocks below are safe to run in the same file/process
 * without interfering with each other's counts — but every request WITHIN
 * one test() block does share state (same `req.ip`), which each block's own
 * request budget accounts for explicitly using the real exported
 * thresholds rather than hardcoded numbers.
 */

const TAG = `auth-ratelimit-${Date.now()}`;
const PASSWORD = "AuthRateLimitTest@123";

async function listen(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

interface LoginResponse {
  success: boolean;
  data?: { token?: string };
  message?: string;
}

test("P1 — POST /auth/login is throttled per-IP without weakening the existing per-account lockout", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdEmails: string[] = [];

  try {
    const engineerRole = await prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } });
    const passwordHash = await hashPassword(PASSWORD);

    const emailA = `${TAG}-a@example.com`;
    const userA = await prisma.portalUser.create({
      data: { fullName: "Rate Limit Test A", email: emailA, passwordHash, department: "PMO", roleId: engineerRole.id, forcePasswordChange: false },
    });
    const emailB = `${TAG}-b@example.com`;
    const userB = await prisma.portalUser.create({
      data: { fullName: "Rate Limit Test B (lockout)", email: emailB, passwordHash, department: "PMO", roleId: engineerRole.id, forcePasswordChange: false },
    });
    createdUserIds.push(userA.id, userB.id);
    createdEmails.push(emailA, emailB);

    const postLogin = (email: string, password: string) =>
      fetch(`${url}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

    let requestsUsed = 0;

    // ---- 1. Legitimate login succeeds (first request against this IP, well within budget). ----
    const legit = await postLogin(emailA, PASSWORD);
    requestsUsed++;
    assert.equal(legit.status, 200, "a legitimate login must succeed under the rate limiter");
    const legitJson = (await legit.json()) as LoginResponse;
    assert.ok(legitJson.data?.token, "a successful login must still return a real token");

    // ---- 2. Unknown email and a known email with the wrong password remain
    // indistinguishable — anti-enumeration is unaffected by this change. ----
    const wrongPassRes = await postLogin(emailA, "definitely-wrong");
    requestsUsed++;
    const unknownEmailRes = await postLogin(`${TAG}-nobody@example.com`, "whatever");
    requestsUsed++;
    assert.equal(wrongPassRes.status, unknownEmailRes.status);
    const wrongPassJson = (await wrongPassRes.json()) as LoginResponse;
    const unknownEmailJson = (await unknownEmailRes.json()) as LoginResponse;
    assert.equal(wrongPassJson.message, unknownEmailJson.message);

    // ---- 3. The pre-existing per-account failed-attempt lockout still
    // fires — completely unaffected by, and independent of, the new per-IP
    // throttle (proves this fix does not weaken or replace it). ----
    const cap = env.MAX_FAILED_LOGIN_ATTEMPTS;
    assert.ok(cap >= 1 && requestsUsed + cap < LOGIN_RATE_LIMIT_MAX_REQUESTS, "test budget assumption must hold for MAX_FAILED_LOGIN_ATTEMPTS vs the IP rate limit");
    for (let i = 0; i < cap; i++) {
      const res = await postLogin(emailB, "still-wrong");
      requestsUsed++;
      if (i < cap - 1) {
        assert.equal(res.status, 401, `attempt ${i + 1} of ${cap} must not lock the account yet`);
      } else {
        assert.equal(res.status, 403, "the cap-th wrong attempt must lock the account (403), unrelated to the IP throttle");
      }
    }
    const lockedUser = await prisma.portalUser.findUniqueOrThrow({ where: { id: userB.id } });
    assert.equal(lockedUser.accountLocked, true, "per-account lockout must still work exactly as before this fix");

    // ---- 4. Password spraying: pad out the remaining IP budget with
    // distinct nonexistent emails (simulating an attacker trying many
    // different accounts, each individually far under the per-account
    // threshold) — every one of these must still resolve as a normal 401,
    // right up to the last request the budget allows. ----
    while (requestsUsed < LOGIN_RATE_LIMIT_MAX_REQUESTS) {
      const res = await postLogin(`${TAG}-spray-${requestsUsed}@example.com`, "whatever");
      requestsUsed++;
      assert.equal(res.status, 401, "every request within budget must behave normally, even across many different sprayed accounts");
    }

    // ---- 5. The NEXT request — now over budget — must be throttled (429),
    // proving password spraying (and, incidentally, further brute-forcing
    // against any single account) is bounded at the IP level once the
    // budget for this window is exhausted. ----
    const throttled = await postLogin(emailA, PASSWORD);
    assert.equal(throttled.status, 429, "a request beyond the per-IP budget must be throttled, even with fully correct credentials");
  } finally {
    await prisma.authAuditLog.deleteMany({
      where: { OR: [{ userId: { in: createdUserIds } }, { email: { in: createdEmails } }] },
    });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});

test("P1 — POST /auth/forgot-password is throttled per-IP, and a legitimate reset remains fully functional", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdEmails: string[] = [];

  try {
    const engineerRole = await prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } });
    const passwordHash = await hashPassword(PASSWORD);
    const email = `${TAG}-forgot@example.com`;
    const user = await prisma.portalUser.create({
      data: { fullName: "Rate Limit Test Forgot", email, passwordHash, department: "PMO", roleId: engineerRole.id, forcePasswordChange: false },
    });
    createdUserIds.push(user.id);
    createdEmails.push(email);

    const postForgot = (targetEmail: string) =>
      fetch(`${url}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });

    // ---- Reset-email flooding: every request up to the budget succeeds
    // (the endpoint's own anti-enumeration design always returns success,
    // known email or not — unaffected by this fix), the next is throttled. ----
    for (let i = 0; i < FORGOT_PASSWORD_RATE_LIMIT_MAX_REQUESTS; i++) {
      const res = await postForgot(i % 2 === 0 ? email : `${TAG}-flood-${i}@example.com`);
      assert.equal(res.status, 200, `request ${i + 1} of ${FORGOT_PASSWORD_RATE_LIMIT_MAX_REQUESTS} must succeed`);
    }
    const throttled = await postForgot(email);
    assert.equal(throttled.status, 429, "a forgot-password request beyond the per-IP budget must be throttled");

    // ---- Legitimate password reset remains fully functional: bypass the
    // (already-flooded) forgot-password endpoint by seeding a real
    // PasswordResetToken directly — the same row forgotPassword() itself
    // would have created — and prove POST /auth/reset-password with it
    // still actually changes the password. This is testing reset-password's
    // OWN (separate) limiter budget, untouched by forgot-password's above. ----
    const plaintext = "legit-reset-token-for-rate-limit-test";
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(plaintext), expiresAt: new Date(Date.now() + 15 * 60 * 1000) },
    });

    const newPassword = "AuthRateLimitTestNEW@456";
    const resetRes = await fetch(`${url}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: plaintext, newPassword, confirmPassword: newPassword }),
    });
    assert.equal(resetRes.status, 200, "a legitimate reset-password request must still succeed under the new limiter");

    // Verified directly against the DB (not via POST /auth/login) — the
    // OTHER test() in this file deliberately exhausts /auth/login's own
    // shared per-IP budget to prove it throttles, and node:test runs a
    // file's test() blocks sequentially against the same `req.ip`, so a
    // real /auth/login call here would collide with that already-spent
    // budget and prove nothing about reset-password's own correctness.
    const updatedUser = await prisma.portalUser.findUniqueOrThrow({ where: { id: user.id } });
    const newPasswordWorks = await comparePassword(newPassword, updatedUser.passwordHash);
    assert.ok(newPasswordWorks, "the new password set via reset must actually be the one stored");
  } finally {
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.authAuditLog.deleteMany({
      where: { OR: [{ userId: { in: createdUserIds } }, { email: { in: createdEmails } }] },
    });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});

test("P1 — reset-token brute-force attempts (validate-reset-token + reset-password) are throttled per-IP", async () => {
  const { url, close } = await listen();

  try {
    // resetTokenRateLimit is shared by BOTH /validate-reset-token and
    // /reset-password (see authRateLimit.ts's own comment on why) — the
    // previous test() in this file already spent exactly one request
    // against this same limiter (its one legitimate /reset-password call),
    // since node:test runs a file's test() blocks sequentially by default
    // and every request from this file shares one `req.ip`. Rather than
    // assume a brittle exact remaining count, this loops until it actually
    // observes the throttle, bounded well above the real threshold as a
    // safety net against an infinite loop if the limiter ever regressed to
    // never throttling at all.
    const getValidate = (token: string) => fetch(`${url}/auth/validate-reset-token?token=${encodeURIComponent(token)}`);

    let sawThrottle = false;
    const safetyBound = RESET_TOKEN_RATE_LIMIT_MAX_REQUESTS + 5;
    for (let i = 0; i < safetyBound; i++) {
      const res = await getValidate(`${TAG}-guess-${i}`);
      if (res.status === 429) {
        sawThrottle = true;
        break;
      }
      assert.equal(res.status, 200, "a garbage token must resolve normally (valid: false) while under budget");
      const json = (await res.json()) as { data?: { valid: boolean } };
      assert.equal(json.data?.valid, false);
    }

    assert.ok(sawThrottle, `expected a 429 within ${safetyBound} requests against the shared reset-token budget, but never saw one`);
  } finally {
    await close();
  }
});
