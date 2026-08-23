import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { notify } from "./notification.service.js";

const TAG = `notif-p6-${Date.now()}`;

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

function tokenFor(user: { id: string; email: string; roleId: string; roleName: string }): string {
  return signAccessToken({ sub: user.id, email: user.email, roleId: user.roleId, roleName: user.roleName });
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A structurally-valid (65-byte uncompressed EC point) but not really browser-negotiated push subscription keypair — enough to pass web-push's own shape validation for the delivery-failure-tolerance test below. */
function fakeSubscriptionKeys(): { p256dh: string; auth: string } {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return { p256dh: b64url(ecdh.getPublicKey()), auth: b64url(crypto.randomBytes(16)) };
}

test("Notification infrastructure — auth, ownership, pagination, subscriptions, push failure tolerance", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdNotificationIds: string[] = [];
  const createdSubscriptionIds: string[] = [];

  try {
    const [notificationsModule, engineerRole] = await Promise.all([
      prisma.module.findUniqueOrThrow({ where: { name: "Notifications" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
    ]);
    const passwordHash = await hashPassword("NotifP6Test@123");

    const noModuleUser = await prisma.portalUser.create({
      data: {
        fullName: "Notif P6 No Module",
        email: `${TAG}-nomodule@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
      },
    });
    createdUserIds.push(noModuleUser.id);

    const userA = await prisma.portalUser.create({
      data: {
        fullName: "Notif P6 User A",
        email: `${TAG}-userA@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: notificationsModule.id } },
      },
    });
    createdUserIds.push(userA.id);

    const userB = await prisma.portalUser.create({
      data: {
        fullName: "Notif P6 User B",
        email: `${TAG}-userB@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: notificationsModule.id } },
      },
    });
    createdUserIds.push(userB.id);

    const tokenA = tokenFor({ ...userA, roleName: engineerRole.name });
    const tokenB = tokenFor({ ...userB, roleName: engineerRole.name });
    const tokenNoModule = tokenFor({ ...noModuleUser, roleName: engineerRole.name });

    type Json = Record<string, any>;
    const call = async (method: string, path: string, token?: string, body?: unknown) => {
      const res = await fetch(`${url}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const json = (await res.json().catch(() => null)) as Json | null;
      return { status: res.status, json };
    };

    // ---- A. Authentication ----
    const unauth = await call("GET", "/notifications");
    assert.equal(unauth.status, 401);

    const noModuleRes = await call("GET", "/notifications", tokenNoModule);
    assert.equal(noModuleRes.status, 403);

    // ---- Seed: 5 notifications directly for userA, 1 for userB (via the repository, bypassing the absent public "send" endpoint by design) ----
    for (let i = 0; i < 5; i++) {
      const row = await prisma.notification.create({
        data: { userId: userA.id, title: `A-${i}`, message: "msg", type: "Test", isRead: i < 2 },
      });
      createdNotificationIds.push(row.id);
    }
    const userBNotification = await prisma.notification.create({
      data: { userId: userB.id, title: "B-0", message: "msg", type: "Test" },
    });
    createdNotificationIds.push(userBNotification.id);

    // ---- C. Pagination ----
    const page1 = await call("GET", "/notifications?page=1&pageSize=2", tokenA);
    assert.equal(page1.status, 200);
    assert.equal(page1.json!.data.items.length, 2);
    assert.equal(page1.json!.data.total, 5, "total must count only userA's own notifications, never userB's");
    assert.equal(page1.json!.data.page, 1);
    assert.equal(page1.json!.data.pageSize, 2);

    const page3 = await call("GET", "/notifications?page=3&pageSize=2", tokenA);
    assert.equal(page3.json!.data.items.length, 1, "5 rows at pageSize=2 must leave exactly 1 on page 3");

    // ---- B. Ownership — user B never sees user A's notifications in their own list ----
    const bList = await call("GET", "/notifications?pageSize=50", tokenB);
    assert.equal(bList.json!.data.total, 1);
    assert.ok(bList.json!.data.items.every((n: Json) => n.id === userBNotification.id));

    // ---- D. Unread count — per user, correct ----
    const unreadA = await call("GET", "/notifications/unread-count", tokenA);
    assert.equal(unreadA.json!.data.count, 3, "5 seeded, 2 pre-marked read -> 3 unread for userA");
    const unreadB = await call("GET", "/notifications/unread-count", tokenB);
    assert.equal(unreadB.json!.data.count, 1);

    // ---- B/K. Ownership — userB cannot mark userA's notification as read (404, not 403 — "not found" precedent) ----
    const crossMarkRead = await call("PATCH", `/notifications/${createdNotificationIds[2]}/read`, tokenB);
    assert.equal(crossMarkRead.status, 404);
    const stillUnreadCheck = await prisma.notification.findUnique({ where: { id: createdNotificationIds[2] } });
    assert.equal(stillUnreadCheck?.isRead, false, "cross-user mark-read attempt must not have changed the row");

    // ---- E. Mark one read — only that row, only for its real owner ----
    const markOne = await call("PATCH", `/notifications/${createdNotificationIds[2]}/read`, tokenA);
    assert.equal(markOne.status, 200);
    assert.equal(markOne.json!.data.isRead, true);
    assert.ok(markOne.json!.data.readAt);
    const unreadAfterOne = await call("GET", "/notifications/unread-count", tokenA);
    assert.equal(unreadAfterOne.json!.data.count, 2);
    const userBUnchanged = await prisma.notification.findUnique({ where: { id: userBNotification.id } });
    assert.equal(userBUnchanged?.isRead, false, "marking userA's notification read must never touch userB's");

    // ---- F. Read all — only the caller's own unread notifications ----
    const readAll = await call("POST", "/notifications/read-all", tokenA);
    assert.equal(readAll.status, 200);
    assert.equal(readAll.json!.data.updatedCount, 2, "2 remaining unread for userA at this point");
    const unreadAfterAll = await call("GET", "/notifications/unread-count", tokenA);
    assert.equal(unreadAfterAll.json!.data.count, 0);
    const userBStillUnread = await call("GET", "/notifications/unread-count", tokenB);
    assert.equal(userBStillUnread.json!.data.count, 1, "read-all for userA must never affect userB's unread count");

    // ---- G/H. Push subscription create + duplicate-endpoint upsert ----
    const keys1 = fakeSubscriptionKeys();
    const endpoint = `https://example-push-service.invalid/${TAG}`;
    const sub1 = await call("POST", "/notifications/push-subscriptions", tokenA, {
      endpoint,
      keys: keys1,
      userAgent: "test-agent-1",
    });
    assert.equal(sub1.status, 201);
    createdSubscriptionIds.push(sub1.json!.data.id);

    const keys2 = fakeSubscriptionKeys();
    const sub2 = await call("POST", "/notifications/push-subscriptions", tokenA, {
      endpoint, // same endpoint again — must upsert, not duplicate
      keys: keys2,
      userAgent: "test-agent-1-updated",
    });
    assert.equal(sub2.status, 201);
    assert.equal(sub2.json!.data.id, sub1.json!.data.id, "same endpoint must reuse the same row (upsert), never create a second one");

    const rowCount = await prisma.pushSubscription.count({ where: { endpoint } });
    assert.equal(rowCount, 1, "exactly one PushSubscription row must exist for this endpoint, never two");

    // ---- K. userId spoofing — the request body has no userId field at all (schema doesn't accept one); confirm the created row's owner is the token's own subject regardless ----
    const storedSub = await prisma.pushSubscription.findUnique({ where: { endpoint } });
    assert.equal(storedSub?.userId, userA.id, "subscription must always belong to the authenticated caller, never a spoofed id");

    // ---- B/K. Ownership — userB cannot delete userA's subscription ----
    const crossDelete = await call("DELETE", `/notifications/push-subscriptions/${sub1.json!.data.id}`, tokenB);
    assert.equal(crossDelete.status, 404);
    const stillExists = await prisma.pushSubscription.findUnique({ where: { id: sub1.json!.data.id } });
    assert.ok(stillExists, "userB's failed delete attempt must not have removed userA's subscription");

    // ---- push-config endpoint — public key exposed, never the private key ----
    const pushConfig = await call("GET", "/notifications/push-config", tokenA);
    assert.equal(pushConfig.status, 200);
    assert.equal(typeof pushConfig.json!.data.configured, "boolean");
    if (pushConfig.json!.data.configured) {
      assert.equal(typeof pushConfig.json!.data.publicKey, "string");
    }

    // ---- I/J. notify() persists a Notification row even though the only active subscription is unreachable, and never throws; the unreachable subscription's failure never blocks or gets confused with a genuine 404/410 revoke ----
    const beforeCount = await prisma.notification.count({ where: { userId: userA.id } });
    // Point the (already-created) subscription at an unreachable loopback port instead of the fake external endpoint, to force a real connection failure without making any real external network call.
    await prisma.pushSubscription.update({
      where: { id: sub1.json!.data.id },
      data: { endpoint: `https://127.0.0.1:1/${TAG}-unreachable` },
    });
    await notify([userA.id], { title: "Infra test", message: "should persist regardless of push outcome", type: "Test" });
    const afterCount = await prisma.notification.count({ where: { userId: userA.id } });
    assert.equal(afterCount, beforeCount + 1, "notify() must persist a Notification row even when the only push subscription is unreachable");

    const subAfterFailure = await prisma.pushSubscription.findUnique({ where: { id: sub1.json!.data.id } });
    assert.equal(
      subAfterFailure?.revokedAt,
      null,
      "a connection failure (not a real 404/410 from the push service) must never revoke the subscription"
    );

    // ---- entityType/entityId -> actionUrl allowlist (Project is supported; an unsupported type yields null, never a client-suppliable arbitrary URL) ----
    const beforeActionUrlCount = await prisma.notification.count({ where: { userId: userB.id } });
    await notify([userB.id], {
      title: "Project event",
      message: "test",
      type: "Test",
      entityType: "Project",
      entityId: "some-project-id",
    });
    const withProjectEntity = await prisma.notification.findFirst({
      where: { userId: userB.id, title: "Project event" },
      orderBy: { createdAt: "desc" },
    });
    assert.equal(withProjectEntity?.actionUrl, "/projects/edit/some-project-id");

    await notify([userB.id], {
      title: "Unsupported entity event",
      message: "test",
      type: "Test",
      // @ts-expect-error deliberately an entity type outside the allowlist, to prove it degrades to null rather than being trusted
      entityType: "SomethingNotAllowlisted",
      entityId: "irrelevant",
    });
    const withUnsupportedEntity = await prisma.notification.findFirst({
      where: { userId: userB.id, title: "Unsupported entity event" },
      orderBy: { createdAt: "desc" },
    });
    assert.equal(withUnsupportedEntity?.actionUrl, null, "an entityType outside the allowlist must never produce an actionUrl");
    assert.ok(beforeActionUrlCount >= 0);
  } finally {
    if (createdSubscriptionIds.length > 0) {
      await prisma.pushSubscription.deleteMany({ where: { id: { in: createdSubscriptionIds } } });
    }
    await prisma.pushSubscription.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    if (createdUserIds.length > 0) {
      await prisma.userModuleAccess.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await close();
  }
});
