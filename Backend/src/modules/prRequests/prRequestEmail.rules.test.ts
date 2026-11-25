import assert from "node:assert/strict";
import { test } from "node:test";
import { MANDATORY_PR_REQUEST_CC_EMAIL } from "../../shared/email/email.constants.js";
import { buildPRRequestRecipients, sameEmailAddress } from "./prRequestEmail.rules.js";

/** PR Request approval emails (Nov 2026): the mandatory CC rule. */

test("the mandatory CC is arun@ifluids.com", () => assert.equal(MANDATORY_PR_REQUEST_CC_EMAIL, "arun@ifluids.com"));

test("another person is the To: they stay the To and the mandatory address is the CC", () => {
  assert.deepEqual(buildPRRequestRecipients("judith@example.com"), { to: "judith@example.com", cc: ["arun@ifluids.com"] });
});

test("the mandatory person is already the To: no CC at all, whatever the letter case or outer spaces", () => {
  for (const to of ["arun@ifluids.com", "Arun@iFluids.com", "ARUN@IFLUIDS.COM", "  arun@ifluids.com  "]) {
    assert.deepEqual(buildPRRequestRecipients(to), { to }, JSON.stringify(to));
  }
});

test("only the very same address is deduplicated: look-alikes keep the CC", () => {
  for (const to of ["arun.v@ifluids.com", "arun@ifluids.co", "xarun@ifluids.com", "arun@ifluids.com.example.org"]) {
    assert.deepEqual(buildPRRequestRecipients(to).cc, ["arun@ifluids.com"], to);
  }
  assert.equal(sameEmailAddress(" A@B.com", "a@b.COM "), true);
});
