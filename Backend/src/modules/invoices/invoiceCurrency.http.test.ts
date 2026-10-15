import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { invoiceEditDeleteGrants } from "./invoiceApprovalGrants.testutil.js";

/**
 * Invoice Currency feature (Oct 2026) — USD invoices, the project currency
 * lock, and their interaction with the existing INR workflow, end to end
 * over HTTP against isolated, tagged test data (cleaned up in `finally`).
 * The pure rules are unit tested in invoiceCurrency.rules.test.ts; this
 * proves the wiring: validation, transaction-level lock enforcement under
 * concurrency, the inferred lock for pre-feature projects, and the API
 * shapes the frontend reads.
 */

const TAG = `invcurrency-${Date.now()}`;

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

interface LineDto {
  id: string;
  invoiceNo: string;
  status: string;
  invoiceAmountINR: number;
  currency: string;
  exchangeRateToINR: number;
  invoiceAmountOriginal: number | null;
}

test("Invoice Currency — all seven currencies, project currency lock, and INR coexistence", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const [engineerRole, invoicesModule, projectsModule, raiseInvoiceApproval] = await Promise.all([
      prisma.portalRole.findFirstOrThrow({ where: { name: "Engineer" } }),
      prisma.module.findFirstOrThrow({ where: { name: "Invoices" } }),
      prisma.module.findFirstOrThrow({ where: { name: "Projects" } }),
      prisma.approvalType.findFirstOrThrow({ where: { name: "Raise Invoice" } }),
    ]);
    const passwordHash = await hashPassword("InvCurrencyUsdTest@123");
    const raiser = await prisma.portalUser.create({
      data: {
        fullName: "InvCurrencyUsd Raiser",
        email: `${TAG}-raiser@example.com`,
        passwordHash,
        department: "Accounts",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: [{ moduleId: projectsModule.id }, { moduleId: invoicesModule.id }] },
        approvalPermissions: { create: [{ approvalTypeId: raiseInvoiceApproval.id }, ...(await invoiceEditDeleteGrants())] },
      },
    });
    createdUserIds.push(raiser.id);
    const token = signAccessToken({ sub: raiser.id, email: raiser.email, roleId: engineerRole.id, roleName: engineerRole.name });
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    let projectSeq = 0;
    async function makeProject(itemCount: number, woValue = 1_000_000) {
      projectSeq += 1;
      const project = await prisma.project.create({
        data: {
          poMonth: "2026-10",
          prCategory: "India",
          prNo: `${TAG}-PR-${projectSeq}`,
          client: "InvCurrencyUsd Client",
          department: "Process",
          domesticForeign: "Foreign",
          projectTitle: `Invoice Currency USD regression ${projectSeq}`,
          workOrderStatus: "Received",
          projectStartDate: new Date("2026-01-01"),
          projectEndDate: new Date("2026-12-31"),
          projectStatus: "Active",
          contractType: "LUMP SUM",
          createdByUserId: null,
        },
      });
      createdProjectIds.push(project.id);
      const items = [];
      for (let i = 0; i < itemCount; i += 1) {
        items.push(
          await prisma.quantityItem.create({
            data: {
              projectId: project.id,
              description: `InvCurrencyUsd Item ${i + 1}`,
              woQty: 10,
              uom: "DAY",
              unitRate: woValue / 10,
              exchangeRate: 1,
              unitRateINR: woValue / 10,
              woValue,
            },
          })
        );
      }
      return { project, items };
    }

    const createLine = (quantityItemId: string, body: Record<string, unknown>) =>
      fetch(`${url}/quantity/${quantityItemId}/invoice-lines`, {
        method: "POST",
        headers,
        body: JSON.stringify({ invoiceDate: new Date("2026-03-01").toISOString(), quantityBilled: 0, ...body }),
      });
    const patchLine = (id: string, body: Record<string, unknown>) =>
      fetch(`${url}/invoice-lines/${id}`, { method: "PATCH", headers, body: JSON.stringify(body) });
    const dataOf = async (res: Response) => ((await res.json()) as { data: LineDto }).data;
    const projectLock = async (projectId: string) =>
      (await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { invoiceCurrency: true } })).invoiceCurrency;

    // =================================================================
    // A. Fresh project: USD create, pre-lock drafts, Draft -> Paid lock,
    //    lock enforcement, cancel never unlocks, USD amount edits.
    // =================================================================
    const a = await makeProject(2);
    const [itemA1, itemA2] = a.items;

    const usdDraftRes = await createLine(itemA1!.id, {
      invoiceNo: `${TAG}-A-USD-1`,
      currency: "USD",
      exchangeRateToINR: 83.5,
      invoiceAmountOriginal: 100,
      status: "Draft",
    });
    assert.equal(usdDraftRes.status, 201, "a USD Draft with a valid rate is accepted");
    const usdDraft = await dataOf(usdDraftRes);
    assert.equal(usdDraft.currency, "USD");
    assert.equal(usdDraft.exchangeRateToINR, 83.5);
    assert.equal(usdDraft.invoiceAmountOriginal, 100);
    assert.equal(usdDraft.invoiceAmountINR, 8_350, "INR equivalent is derived server-side (100 x 83.5)");
    assert.equal(await projectLock(a.project.id), null, "a Draft never establishes the lock");

    const inrDraftRes = await createLine(itemA2!.id, { invoiceNo: `${TAG}-A-INR-1`, invoiceAmountINR: 5_000, status: "Draft" });
    assert.equal(inrDraftRes.status, 201, "before any lock exists, a Draft in the other currency is still allowed");
    const inrDraft = await dataOf(inrDraftRes);

    const mixedInvoiceRes = await createLine(itemA2!.id, { invoiceNo: `${TAG}-A-USD-1`, invoiceAmountINR: 1_000, status: "Draft" });
    assert.equal(mixedInvoiceRes.status, 409, "one invoice (invoiceNo) can never mix currencies");
    const mixedRateRes = await createLine(itemA2!.id, {
      invoiceNo: `${TAG}-A-USD-1`,
      currency: "USD",
      exchangeRateToINR: 84,
      invoiceAmountOriginal: 10,
      status: "Draft",
    });
    assert.equal(mixedRateRes.status, 409, "one invoice can never mix exchange rates");

    const paidRes = await patchLine(usdDraft.id, { status: "Paid" });
    assert.equal(paidRes.status, 200, "Draft -> Paid directly is allowed");
    assert.equal(await projectLock(a.project.id), "USD", "a direct Draft -> Paid transition establishes the lock");

    const raiseInrRes = await patchLine(inrDraft.id, { status: "Raised" });
    assert.equal(raiseInrRes.status, 409, "raising a Draft in a locked-out currency is rejected");
    assert.equal((await prisma.invoiceLine.findUniqueOrThrow({ where: { id: inrDraft.id } })).status, "Draft", "rejected PATCH leaves no partial update");

    const newInrRes = await createLine(itemA2!.id, { invoiceNo: `${TAG}-A-INR-2`, invoiceAmountINR: 1_000, status: "Draft" });
    assert.equal(newInrRes.status, 409, "once locked, even a new Draft in the other currency is rejected");
    const linesBefore = await prisma.invoiceLine.count({ where: { quantityItem: { projectId: a.project.id } } });
    assert.equal(linesBefore, 2, "rejected creates never persist a row");

    const cancelRes = await patchLine(usdDraft.id, { status: "Cancelled" });
    assert.equal(cancelRes.status, 200);
    assert.equal(await projectLock(a.project.id), "USD", "cancelling the locking invoice never unlocks the project");

    // USD amount edits: via original amount only; currency/rate frozen.
    const usdRaisedRes = await createLine(itemA1!.id, {
      invoiceNo: `${TAG}-A-USD-2`,
      currency: "USD",
      exchangeRateToINR: 83,
      invoiceAmountOriginal: 1_000,
      invoiceAmountINR: 83_000,
      status: "Raised",
    });
    assert.equal(usdRaisedRes.status, 201, "a USD line with a matching client INR figure is accepted");
    const usdRaised = await dataOf(usdRaisedRes);

    const editOriginalRes = await patchLine(usdRaised.id, { invoiceAmountOriginal: 1_200 });
    assert.equal(editOriginalRes.status, 200);
    const edited = await dataOf(editOriginalRes);
    assert.equal(edited.invoiceAmountOriginal, 1_200);
    assert.equal(edited.invoiceAmountINR, 99_600, "INR recomputed at the line's own recorded rate");

    // The frontend's full-payload resend on a status-only change must be a no-op for amounts.
    const fullResendRes = await patchLine(usdRaised.id, {
      invoiceAmountINR: 99_600,
      invoiceAmountOriginal: 1_200,
      currency: "USD",
      exchangeRateToINR: 83,
      status: "PartiallyPaid",
    });
    assert.equal(fullResendRes.status, 200);
    assert.equal((await dataOf(fullResendRes)).invoiceAmountINR, 99_600);

    assert.equal((await patchLine(usdRaised.id, { invoiceAmountINR: 50_000 })).status, 400, "a USD line's INR amount can't be edited directly");
    assert.equal((await patchLine(usdRaised.id, { exchangeRateToINR: 90 })).status, 400, "rate is frozen");
    assert.equal((await patchLine(usdRaised.id, { currency: "INR" })).status, 400, "currency is frozen");
    const afterRejected = await prisma.invoiceLine.findUniqueOrThrow({ where: { id: usdRaised.id } });
    assert.equal(afterRejected.invoiceAmountINR, 99_600, "rejected PATCHes change nothing");
    assert.equal(afterRejected.exchangeRateToINR, 83);

    // =================================================================
    // B. Validation — every invalid currency/rate/amount is a 400, no row.
    // =================================================================
    const b = await makeProject(1, 100_000);
    const itemB = b.items[0]!;
    const invalidBodies: Array<[string, Record<string, unknown>]> = [
      ["unsupported currency GBP", { currency: "GBP", exchangeRateToINR: 105, invoiceAmountOriginal: 10 }],
      ["lowercase currency code", { currency: "usd", exchangeRateToINR: 83, invoiceAmountOriginal: 10 }],
      ["too many decimals for USD", { currency: "USD", exchangeRateToINR: 83, invoiceAmountOriginal: 10.125 }],
      ["too many decimals for OMR", { currency: "OMR", exchangeRateToINR: 216, invoiceAmountOriginal: 10.1255 }],
      ["missing rate", { currency: "USD", invoiceAmountOriginal: 10 }],
      ["zero rate", { currency: "USD", exchangeRateToINR: 0, invoiceAmountOriginal: 10 }],
      ["negative rate", { currency: "USD", exchangeRateToINR: -83, invoiceAmountOriginal: 10 }],
      ["non-finite rate", { currency: "USD", exchangeRateToINR: "Infinity", invoiceAmountOriginal: 10 }],
      ["non-numeric rate", { currency: "USD", exchangeRateToINR: "abc", invoiceAmountOriginal: 10 }],
      ["exponent-string rate", { currency: "USD", exchangeRateToINR: "1e3", invoiceAmountOriginal: 10 }],
      ["hex-string rate", { currency: "USD", exchangeRateToINR: "0x10", invoiceAmountOriginal: 10 }],
      ["comma-decimal rate", { currency: "USD", exchangeRateToINR: "83,25", invoiceAmountOriginal: 10 }],
      ["boolean rate", { currency: "USD", exchangeRateToINR: true, invoiceAmountOriginal: 10 }],
      ["blank-string rate", { currency: "USD", exchangeRateToINR: "  ", invoiceAmountOriginal: 10 }],
      ["missing USD amount", { currency: "USD", exchangeRateToINR: 83 }],
      ["negative USD amount", { currency: "USD", exchangeRateToINR: 83, invoiceAmountOriginal: -5 }],
      ["mismatched INR figure", { currency: "USD", exchangeRateToINR: 83, invoiceAmountOriginal: 10, invoiceAmountINR: 10 }],
      ["INR with a non-1 rate", { currency: "INR", exchangeRateToINR: 83, invoiceAmountINR: 10 }],
      ["INR without an amount", { status: "Draft" }],
    ];
    for (const [label, body] of invalidBodies) {
      const res = await createLine(itemB.id, { invoiceNo: `${TAG}-B-${label}`, status: "Draft", ...body });
      assert.equal(res.status, 400, `${label} must be rejected with 400`);
    }
    // The existing Work Order Value ceiling is enforced on the INR equivalent.
    const overCeilingRes = await createLine(itemB.id, {
      invoiceNo: `${TAG}-B-ceiling`,
      currency: "USD",
      exchangeRateToINR: 83,
      invoiceAmountOriginal: 2_000, // 166,000 INR > 100,000 WO value
      status: "Draft",
    });
    assert.equal(overCeilingRes.status, 400, "USD amounts are checked against the INR Work Order Value ceiling");
    assert.equal(await prisma.invoiceLine.count({ where: { quantityItemId: itemB.id } }), 0, "no invalid request persisted a row");
    assert.equal(await projectLock(b.project.id), null);

    // No per-currency rate range: rates outside the old 1–1000 window are
    // accepted exactly as Accounts entered them (Draft, so no lock).
    for (const [suffix, rate] of [["low", 0.012], ["high", 1500], ["decimal-string", "83.25"]] as const) {
      const res = await createLine(itemB.id, {
        invoiceNo: `${TAG}-B-rate-${suffix}`,
        currency: "USD",
        exchangeRateToINR: rate,
        invoiceAmountOriginal: 10,
        status: "Draft",
      });
      assert.equal(res.status, 201, `USD rate ${rate} must be accepted`);
      const saved = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceNo: `${TAG}-B-rate-${suffix}` } });
      assert.equal(saved.exchangeRateToINR, Number(rate));
      assert.equal(saved.invoiceAmountINR, Math.round(10 * Number(rate) * 100) / 100, "INR = original x rate");
    }
    await prisma.invoiceLine.deleteMany({ where: { quantityItemId: itemB.id } });
    await prisma.invoiceNumber.deleteMany({ where: { projectId: b.project.id } });

    // =================================================================
    // C. Pre-feature project: an existing raised INR line (simulating a
    //    production row backfilled by the migration, Project.invoiceCurrency
    //    still null) must already lock the project to INR.
    // =================================================================
    const c = await makeProject(1);
    const itemC = c.items[0]!;
    await prisma.invoiceLine.create({
      data: {
        quantityItemId: itemC.id,
        invoiceNo: `${TAG}-C-LEGACY`,
        invoiceDate: new Date("2025-06-01"),
        quantityBilled: 0,
        invoiceAmountINR: 25_000,
        invoiceAmountOriginal: 25_000,
        status: "Paid",
        createdBy: "Legacy",
      },
    });
    assert.equal(await projectLock(c.project.id), null);
    const legacyUsdRes = await createLine(itemC.id, {
      invoiceNo: `${TAG}-C-USD`,
      currency: "USD",
      exchangeRateToINR: 83,
      invoiceAmountOriginal: 10,
      status: "Draft",
    });
    assert.equal(legacyUsdRes.status, 409, "a project with pre-feature raised INR invoices is already INR-locked");
    const legacyInrRes = await createLine(itemC.id, { invoiceNo: `${TAG}-C-INR`, invoiceAmountINR: 1_000, status: "Raised" });
    assert.equal(legacyInrRes.status, 201, "the existing INR workflow is unaffected");
    assert.equal(await projectLock(c.project.id), "INR", "the inferred lock is persisted on the next genuine invoice");
    const legacyRow = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceNo: `${TAG}-C-LEGACY` } });
    assert.equal(legacyRow.invoiceAmountINR, 25_000, "historical amounts are never touched");
    assert.equal(legacyRow.currency, "INR");

    // =================================================================
    // D. Concurrency — two simultaneous first raises in conflicting
    //    currencies on DIFFERENT QuantityItems of one project: exactly one
    //    wins, the lock matches the winner, the loser leaves no row.
    // =================================================================
    for (let round = 0; round < 3; round += 1) {
      const d = await makeProject(2);
      const [usdRes, inrRes] = await Promise.all([
        createLine(d.items[0]!.id, {
          invoiceNo: `${TAG}-D${round}-USD`,
          currency: "USD",
          exchangeRateToINR: 83,
          invoiceAmountOriginal: 100,
          status: "Raised",
        }),
        createLine(d.items[1]!.id, { invoiceNo: `${TAG}-D${round}-INR`, invoiceAmountINR: 8_300, status: "Raised" }),
      ]);
      const statuses = [usdRes.status, inrRes.status].sort();
      assert.deepEqual(statuses, [201, 409], `round ${round}: exactly one conflicting first raise succeeds`);
      const winner = usdRes.status === 201 ? "USD" : "INR";
      assert.equal(await projectLock(d.project.id), winner, `round ${round}: the lock matches the winning invoice`);
      const lines = await prisma.invoiceLine.findMany({ where: { quantityItem: { projectId: d.project.id } } });
      assert.equal(lines.length, 1, `round ${round}: the rejected request persisted nothing`);
      assert.equal(lines[0]!.currency, winner);
    }

    // =================================================================
    // F. Every supported currency end to end: create Draft, retrieve, edit
    //    the original amount, raise (establishes that currency's lock),
    //    PartiallyPaid -> Paid, and a different currency is then rejected.
    // =================================================================
    const rates: Record<string, number> = { INR: 1, USD: 83.25, EUR: 90.4, AED: 22.67, MYR: 18.95, QAR: 22.87, OMR: 216.35 };
    for (const currency of ["INR", "USD", "EUR", "AED", "MYR", "QAR", "OMR"]) {
      const f = await makeProject(1);
      const itemF = f.items[0]!;
      const rate = rates[currency]!;
      const original = currency === "OMR" ? 100.125 : 100.25;
      const body =
        currency === "INR"
          ? { invoiceAmountINR: original }
          : { currency, exchangeRateToINR: rate, invoiceAmountOriginal: original };
      const createRes = await createLine(itemF.id, { invoiceNo: `${TAG}-F-${currency}`, status: "Draft", ...body });
      assert.equal(createRes.status, 201, `${currency}: create`);
      const created = await dataOf(createRes);
      const expectedINR = Math.round(original * rate * 100) / 100;
      assert.equal(created.currency, currency);
      assert.equal(created.exchangeRateToINR, rate);
      assert.equal(created.invoiceAmountOriginal, original);
      assert.equal(created.invoiceAmountINR, expectedINR, `${currency}: INR equivalent at the recorded rate`);

      const listRes = await fetch(`${url}/projects/${f.project.id}/invoice-items`, { headers });
      assert.equal(listRes.status, 200, `${currency}: retrieve`);
      const listed = ((await listRes.json()) as { data: { items: Array<{ invoices: LineDto[] }> } }).data.items[0]!.invoices[0]!;
      assert.equal(listed.currency, currency);
      assert.equal(listed.invoiceAmountOriginal, original);

      const editedOriginal = currency === "OMR" ? 50.5 : 50.75;
      const editRes = await patchLine(
        created.id,
        currency === "INR" ? { invoiceAmountINR: editedOriginal } : { invoiceAmountOriginal: editedOriginal }
      );
      assert.equal(editRes.status, 200, `${currency}: edit`);
      const edited = await dataOf(editRes);
      assert.equal(edited.invoiceAmountOriginal, editedOriginal);
      assert.equal(edited.invoiceAmountINR, Math.round(editedOriginal * rate * 100) / 100, `${currency}: edit recomputes INR`);

      assert.equal((await patchLine(created.id, { status: "Raised" })).status, 200, `${currency}: raise`);
      assert.equal(await projectLock(f.project.id), currency, `${currency}: first raise locks the project to it`);
      assert.equal((await patchLine(created.id, { status: "PartiallyPaid" })).status, 200);
      assert.equal((await patchLine(created.id, { status: "Paid" })).status, 200);

      const other = currency === "EUR" ? "USD" : "EUR";
      const otherRes = await createLine(itemF.id, {
        invoiceNo: `${TAG}-F-${currency}-other`,
        currency: other,
        exchangeRateToINR: rates[other],
        invoiceAmountOriginal: 1,
        status: "Draft",
      });
      assert.equal(otherRes.status, 409, `${currency}: a ${other} invoice is rejected once locked to ${currency}`);
      const stored = await prisma.invoiceLine.findUniqueOrThrow({ where: { id: created.id } });
      assert.equal(stored.status, "Paid");
      assert.equal(stored.invoiceAmountINR, edited.invoiceAmountINR, `${currency}: status changes never alter the amount`);
    }

    // =================================================================
    // G. DELETE recalculates the lock (confirmed rule, Oct 2026): released
    //    only when no Raised/PartiallyPaid/Paid/Cancelled line remains;
    //    otherwise kept. Cancelling never unlocks.
    // =================================================================
    const deleteLine = (id: string) => fetch(`${url}/invoice-lines/${id}`, { method: "DELETE", headers });
    const dtoLock = async (id: string) =>
      ((await (await fetch(`${url}/projects/${id}`, { headers })).json()) as { data: { invoiceCurrency: string | null } }).data.invoiceCurrency;
    const usd = (invoiceNo: string, status: string, rate = 83) => ({
      invoiceNo,
      currency: "USD",
      exchangeRateToINR: rate,
      invoiceAmountOriginal: 100,
      status,
    });

    // G1. Deleting a USD Draft (never locked) leaves the project unlocked; INR then works.
    const g1 = await makeProject(1);
    const g1Draft = await dataOf(await createLine(g1.items[0]!.id, usd(`${TAG}-G1-1`, "Draft")));
    assert.equal((await deleteLine(g1Draft.id)).status, 200);
    assert.equal(await projectLock(g1.project.id), null, "G1: a deleted Draft never leaves a lock");
    assert.equal((await createLine(g1.items[0]!.id, { invoiceNo: `${TAG}-G1-2`, invoiceAmountINR: 500, status: "Raised" })).status, 201);
    assert.equal(await projectLock(g1.project.id), "INR");

    // G2. Deleting the ONLY invoice — the one that established the USD lock — releases it.
    const g2 = await makeProject(1);
    const g2Line = await dataOf(await createLine(g2.items[0]!.id, usd(`${TAG}-G2-1`, "Raised", 93)));
    assert.equal(await projectLock(g2.project.id), "USD");
    assert.equal((await deleteLine(g2Line.id)).status, 200);
    assert.equal(await projectLock(g2.project.id), null, "G2: no genuine invoice left -> lock released");
    assert.equal(await dtoLock(g2.project.id), null, "G2: ProjectDto (what the frontend reads) reflects the release");
    const g2Inr = await createLine(g2.items[0]!.id, { invoiceNo: `${TAG}-G2-2`, invoiceAmountINR: 700, status: "Raised" });
    assert.equal(g2Inr.status, 201, "G2: a fresh INR invoice is allowed after the release");
    assert.equal(await projectLock(g2.project.id), "INR", "G2: the new invoice establishes the new lock");

    // G3. Two raised USD invoices; deleting one keeps the lock (the other still requires it).
    const g3 = await makeProject(1);
    const g3a = await dataOf(await createLine(g3.items[0]!.id, usd(`${TAG}-G3-1`, "Raised")));
    const g3b = await createLine(g3.items[0]!.id, usd(`${TAG}-G3-2`, "Raised", 84));
    assert.equal(g3b.status, 201);
    assert.equal((await patchLine((await dataOf(g3b)).id, { status: "Paid" })).status, 200);
    assert.equal((await deleteLine(g3a.id)).status, 200);
    assert.equal(await projectLock(g3.project.id), "USD", "G3: another genuine invoice remains -> lock kept");
    assert.equal(
      (await createLine(g3.items[0]!.id, { invoiceNo: `${TAG}-G3-3`, invoiceAmountINR: 1, status: "Draft" })).status,
      409,
      "G3: deletion can never be used to bypass the lock while it is still required"
    );

    // G4. Raised -> Cancelled keeps the lock; deleting a Draft beside it changes nothing;
    //     deleting the cancelled line itself (the last genuine one) releases it.
    const g4 = await makeProject(1);
    const g4Raised = await dataOf(await createLine(g4.items[0]!.id, usd(`${TAG}-G4-1`, "Raised")));
    assert.equal((await patchLine(g4Raised.id, { status: "Cancelled" })).status, 200);
    assert.equal(await projectLock(g4.project.id), "USD", "G4: cancelling never unlocks");
    const g4Draft = await dataOf(await createLine(g4.items[0]!.id, usd(`${TAG}-G4-2`, "Draft")));
    assert.equal((await deleteLine(g4Draft.id)).status, 200);
    assert.equal(await projectLock(g4.project.id), "USD", "G4: deleting a Draft while a cancelled invoice remains keeps the lock");
    assert.equal((await deleteLine(g4Raised.id)).status, 200);
    assert.equal(await projectLock(g4.project.id), null, "G4: deleting the last genuine (cancelled) invoice releases the lock");

    // G5. Delete of an already-deleted line is a clean 404, never a 500.
    assert.equal((await deleteLine(g4Raised.id)).status, 404);

    // G6. Concurrency: deleting the only USD invoice while an INR invoice is raised on another
    //     activity. Either order is valid, but the end state must never mix currencies.
    for (let round = 0; round < 3; round += 1) {
      const g6 = await makeProject(2);
      const only = await dataOf(await createLine(g6.items[0]!.id, usd(`${TAG}-G6-${round}-USD`, "Raised")));
      const [delRes, inrRes] = await Promise.all([
        deleteLine(only.id),
        createLine(g6.items[1]!.id, { invoiceNo: `${TAG}-G6-${round}-INR`, invoiceAmountINR: 100, status: "Raised" }),
      ]);
      assert.equal(delRes.status, 200);
      assert.ok([201, 409].includes(inrRes.status), `G6 round ${round}: INR raise is either accepted or cleanly rejected`);
      const lines = await prisma.invoiceLine.findMany({ where: { quantityItem: { projectId: g6.project.id } } });
      const lockNow = await projectLock(g6.project.id);
      const genuine = lines.filter((l: { status: string }) => l.status !== "Draft");
      if (genuine.length === 0) {
        assert.equal(lockNow, null, `G6 round ${round}: no genuine invoice -> unlocked`);
      } else {
        assert.ok(genuine.every((l: { currency: string }) => l.currency === lockNow), `G6 round ${round}: every genuine invoice matches the lock`);
      }
    }

    // =================================================================
    // E. API shapes the frontend/reports read.
    // =================================================================
    const projectRes = await fetch(`${url}/projects/${a.project.id}`, { headers });
    assert.equal(projectRes.status, 200);
    const projectDto = ((await projectRes.json()) as { data: { invoiceCurrency: string | null; pendingDueINR: number } }).data;
    assert.equal(projectDto.invoiceCurrency, "USD", "ProjectDto exposes the persisted lock");

    const feedRes = await fetch(`${url}/invoice-items`, { headers });
    assert.equal(feedRes.status, 200);
    const feed = ((await feedRes.json()) as { data: { items: Array<LineDto & { projectId: string }> } }).data.items;
    const feedLine = feed.find((line) => line.id === usdRaised.id);
    assert.ok(feedLine, "the reports feed includes the USD line");
    assert.equal(feedLine!.currency, "USD");
    assert.equal(feedLine!.invoiceAmountOriginal, 1_200);
    assert.equal(feedLine!.invoiceAmountINR, 99_600, "reports keep summing the INR equivalent, never the USD figure");
  } finally {
    await prisma.invoiceLine.deleteMany({ where: { quantityItem: { projectId: { in: createdProjectIds } } } });
    await prisma.quantityItem.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});
