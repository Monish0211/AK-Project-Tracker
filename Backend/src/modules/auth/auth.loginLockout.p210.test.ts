import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { env } from "../../shared/utils/env.js";

/**
 * P2-10 — POST /login is the literal front door of this application, yet
 * every other test in this suite bypasses it entirely (each one signs its
 * own JWT directly via signAccessToken() and creates users straight through
 * Prisma). This file exercises the REAL route: password verification,
 * account-enumeration protection (unknown email vs wrong password return
 * the identical generic message), the failed-attempt counter, lockout at
 * MAX_FAILED_LOGIN_ATTEMPTS, and locked/inactive account rejection.
 */

const TAG = `login-lock-p210-${Date.now()}`;
const PASSWORD = "LoginLockoutP210Test@123";

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
  data?: { requiresPasswordChange: boolean; token?: string; user?: { email: string } };
  message?: string;
}

async function postLogin(url: string, email: string, password: string): Promise<{ status: number; json: LoginResponse }> {
  const res = await fetch(`${url}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return { status: res.status, json: (await res.json()) as LoginResponse };
}

test("P2-10 — POST /login: correct/wrong password, account enumeration protection, lockout, locked/inactive rejection", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdEmails: string[] = [];

  try {
    const engineerRole = await prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } });
    const passwordHash = await hashPassword(PASSWORD);

    // ---- Fixture A: normal, unlocked, active user for the correct/wrong-password cases ----
    const emailA = `${TAG}-a@example.com`;
    const userA = await prisma.portalUser.create({
      data: {
        fullName: "P2-10 Login Test A",
        email: emailA,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        isActive: true,
      },
    });
    createdUserIds.push(userA.id);
    createdEmails.push(emailA);

    // Wrong password -> 401, generic message.
    const wrongPass = await postLogin(url, emailA, "definitely-not-the-password");
    assert.equal(wrongPass.status, 401);
    assert.equal(wrongPass.json.message, "Invalid email or password.");

    // Unknown email -> 401, the IDENTICAL generic message (account-enumeration
    // protection — the endpoint must never reveal whether an email exists).
    const unknownEmail = await postLogin(url, `${TAG}-nobody-exists@example.com`, "whatever");
    assert.equal(unknownEmail.status, 401);
    assert.equal(unknownEmail.json.message, wrongPass.json.message);

    // The one failed attempt above must have incremented the counter.
    const afterOneFailure = await prisma.portalUser.findUniqueOrThrow({ where: { id: userA.id } });
    assert.equal(afterOneFailure.failedLoginAttempts, 1);
    assert.equal(afterOneFailure.accountLocked, false);

    // Correct password -> 200, a real session, and the failure counter reset.
    const correctPass = await postLogin(url, emailA, PASSWORD);
    assert.equal(correctPass.status, 200);
    assert.equal(correctPass.json.data?.requiresPasswordChange, false);
    assert.ok(correctPass.json.data?.token, "a successful login must return an access token");
    assert.equal(correctPass.json.data?.user?.email, emailA);

    const afterSuccess = await prisma.portalUser.findUniqueOrThrow({ where: { id: userA.id } });
    assert.equal(afterSuccess.failedLoginAttempts, 0, "a successful login must reset the failed-attempt counter");
    assert.ok(afterSuccess.lastLogin, "a successful login must record lastLogin");

    // ---- Fixture B: dedicated user for the lockout sequence, isolated from A ----
    const emailB = `${TAG}-b@example.com`;
    const userB = await prisma.portalUser.create({
      data: {
        fullName: "P2-10 Login Test B (lockout)",
        email: emailB,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        isActive: true,
      },
    });
    createdUserIds.push(userB.id);
    createdEmails.push(emailB);

    const cap = env.MAX_FAILED_LOGIN_ATTEMPTS;
    assert.ok(cap >= 1, "MAX_FAILED_LOGIN_ATTEMPTS must be a positive number for this test to be meaningful");

    // cap - 1 wrong attempts: still 401, not yet locked.
    for (let i = 0; i < cap - 1; i++) {
      const res = await postLogin(url, emailB, "still-wrong");
      assert.equal(res.status, 401, `attempt ${i + 1} of ${cap} must not lock the account yet`);
    }
    const beforeLockout = await prisma.portalUser.findUniqueOrThrow({ where: { id: userB.id } });
    assert.equal(beforeLockout.failedLoginAttempts, cap - 1);
    assert.equal(beforeLockout.accountLocked, false);

    // The cap-th wrong attempt: this one locks the account, 403 (not 401).
    const lockingAttempt = await postLogin(url, emailB, "still-wrong");
    assert.equal(lockingAttempt.status, 403);
    assert.match(lockingAttempt.json.message ?? "", /locked/i);

    const afterLockout = await prisma.portalUser.findUniqueOrThrow({ where: { id: userB.id } });
    assert.equal(afterLockout.accountLocked, true);

    // Even the CORRECT password is now rejected — locked, not a credentials problem.
    const correctButLocked = await postLogin(url, emailB, PASSWORD);
    assert.equal(correctButLocked.status, 403);
    assert.match(correctButLocked.json.message ?? "", /locked/i);

    // ---- Fixture C: inactive (but not locked) account is rejected too, distinctly ----
    const emailC = `${TAG}-c@example.com`;
    const userC = await prisma.portalUser.create({
      data: {
        fullName: "P2-10 Login Test C (inactive)",
        email: emailC,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        isActive: false,
      },
    });
    createdUserIds.push(userC.id);
    createdEmails.push(emailC);

    const inactiveLogin = await postLogin(url, emailC, PASSWORD);
    assert.equal(inactiveLogin.status, 403);
    assert.match(inactiveLogin.json.message ?? "", /inactive/i);
  } finally {
    if (createdUserIds.length > 0 || createdEmails.length > 0) {
      await prisma.authAuditLog.deleteMany({
        where: {
          OR: [
            ...(createdUserIds.length > 0 ? [{ userId: { in: createdUserIds } }] : []),
            ...(createdEmails.length > 0 ? [{ email: { in: [...createdEmails, `${TAG}-nobody-exists@example.com`] } }] : []),
          ],
        },
      });
    }
    if (createdUserIds.length > 0) {
      await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await close();
  }
});
