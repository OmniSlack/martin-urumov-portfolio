"use strict";

/**
 * Six probes for defect #14 — several individually permitted actions that
 * together cross a limit, and the journal that records them.
 *
 * The second of the four compositional-failure classes. The first gave defect
 * #13; this one was found the same way, by reading the description and asking
 * what in this repository answers it. Nothing did.
 */

const test = require("node:test");
const assert = require("node:assert");
const { Core } = require("./core.js");

const SRC = { source: "doc", provenance: "signed" };
const ACT = { ...SRC, requiresTransition: true, targetSignature: "S" };
const PERMIT = { counterModelTested: true, humanPermit: "PRESENT", permitSignature: "S" };
const CAP = { ...PERMIT, cumulativeLimit: 500, cumulativeField: "amount" };

/** Run one action through begin → complete → release. Returns the verdict. */
function spend(c, amount, ctx, execute = true) {
  const p = { ...ACT, amount };
  const v = c.evaluate(p, ctx);
  if (v.decision !== "CLEAR") return v;
  const k = c.begin(v, p);
  if (execute) c.complete(k, `spent ${amount}`);
  c.release(k);
  return v;
}

test("R1. ten permitted actions may not sum past a limit none of them crossed", () => {
  const c = new Core();
  const decisions = [];
  for (let i = 0; i < 10; i++) decisions.push(spend(c, 100, CAP).decision);
  // 5 × 100 reaches exactly 500, which is the limit and not past it.
  assert.deepStrictEqual(decisions.slice(0, 5), Array(5).fill("CLEAR"));
  assert.strictEqual(decisions[5], "HOLD", "the sixth crosses 500 and must be refused");
  assert.ok(decisions.slice(5).every((d) => d === "HOLD"));
});

test("R2. the reason names the sum, not just a refusal", () => {
  const c = new Core();
  for (let i = 0; i < 5; i++) spend(c, 100, CAP);
  const v = c.evaluate({ ...ACT, amount: 100 }, CAP);
  const r = v.reasons.find((x) => x.includes("Gate 19"));
  assert.ok(r, "Gate 19 must say so by name");
  assert.match(r, /500 already executed plus 100 asked for/);
});

test("R3. no limit supplied means no limit — the gate does not invent one", () => {
  // A gate that makes up its own threshold is not enforcing a policy.
  const c = new Core();
  for (let i = 0; i < 20; i++) {
    assert.strictEqual(spend(c, 1000, PERMIT).decision, "CLEAR",
      "without a cumulativeLimit nothing may be refused on a sum");
  }
});

test("R4. proposed and not executed spends nothing", () => {
  const c = new Core();
  for (let i = 0; i < 5; i++) spend(c, 100, CAP, false); // begun, released, never completed
  assert.strictEqual(c.journal.filter((e) => e.executed === null).length, 5);
  assert.strictEqual(spend(c, 100, CAP).decision, "CLEAR",
    "an action that never happened must not be charged against the limit");
});

test("R5. the journal keeps every action, not only the last", () => {
  // The worse half of defect #14: lastAction is one slot, so the eleventh
  // action erased the tenth. Nine of ten left no trace.
  const c = new Core();
  for (let i = 1; i <= 10; i++) spend(c, 10, PERMIT);
  assert.strictEqual(c.journal.length, 10, "ten actions, ten records");
  assert.strictEqual(c.actionCount, 10);
  assert.strictEqual(c.journal[0].outcome, "spent 10");
  assert.strictEqual(c.journal[9], c.lastAction, "lastAction is the tail, not the only copy");
  // And each record says what it was FOR, not merely that it happened.
  assert.strictEqual(c.journal[3].proposal.amount, 10);
  assert.ok(Object.isFrozen(c.journal[3]));
});

test("R6. under a limit, a proposal with nothing to count is held, not waved through", () => {
  const c = new Core();
  const v = c.evaluate({ ...ACT }, CAP); // no `amount` at all
  assert.strictEqual(v.decision, "HOLD");
  assert.ok(v.reasons.some((x) => /Gate 19.*cannot be counted/.test(x)));
});
