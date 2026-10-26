"use strict";

/**
 * Eleven adversarial probes, written after v0.10 to look for defects rather
 * than to confirm behaviour.
 *
 * Each one targets a path the existing 139 do not walk. Three of them
 * deliberately aim at places where the code may be trusting something it has
 * not checked; if those fail, the failure is the finding and is reported as
 * such rather than quietly adjusted until it passes.
 */

const test = require("node:test");
const assert = require("node:assert");
const { Core } = require("./core.js");

const CLEAN = { counterModelTested: true };
const SOURCED = { source: "doc", provenance: "signed" };

/** A proposal that will act, so it can claim the lock. */
const ACT = { ...SOURCED, requiresTransition: true, targetSignature: "S" };
const PERMIT = { ...CLEAN, humanPermit: "PRESENT", permitSignature: "S" };

// ---------------------------------------------------------------- Gate 18

test("P1. NaN is a number by typeof and must not pass as a confidence", () => {
  const c = new Core();
  const r = c.evaluate({ ...SOURCED, confidence: NaN, evidence: ["a"] }, CLEAN);
  assert.strictEqual(r.decision, "HOLD");
  assert.ok(r.reasons.some((x) => x.includes("Gate 18")));
});

test("P2. Infinity is not a confidence either", () => {
  const c = new Core();
  const r = c.evaluate(
    { ...SOURCED, confidence: Infinity, evidence: ["a"] }, CLEAN);
  assert.strictEqual(r.decision, "HOLD");
});

test("P3. exactly 0 and exactly 1 are both refused, not treated as certainty", () => {
  const c = new Core();
  for (const v of [0, 1]) {
    const r = c.evaluate({ ...SOURCED, confidence: v, evidence: ["a"] }, CLEAN);
    assert.strictEqual(r.decision, "HOLD", `confidence ${v} should hold`);
  }
});

test("P4. evidence that is a non-empty string is not an evidence list", () => {
  // "abc".length is 3, so a length check alone would let a string through.
  const c = new Core();
  const r = c.evaluate(
    { ...SOURCED, confidence: 0.9, evidence: "plenty of evidence" }, CLEAN);
  assert.strictEqual(r.decision, "HOLD");
});

// ------------------------------------------------- the action lock, v0.10

test("P5. complete() after release() cannot resurrect a finished action", () => {
  const c = new Core();
  const key = c.begin(c.evaluate(ACT, PERMIT), ACT);
  assert.ok(key);
  assert.ok(c.release(key));
  assert.strictEqual(c.complete(key, "late"), null);
  assert.strictEqual(c.lastAction.executed, null);
  assert.strictEqual(c.lastAction.outcome, null);
});

test("P6. releasing twice does not overwrite the record of the first release", () => {
  const c = new Core();
  const key = c.begin(c.evaluate(ACT, PERMIT), ACT);
  c.complete(key, "done");
  assert.ok(c.release(key));
  const first = c.lastAction;
  assert.strictEqual(c.release(key), false);
  assert.strictEqual(c.lastAction, first);
  assert.strictEqual(c.lastAction.outcome, "done");
});

test("P7. the released record is frozen, not merely returned", () => {
  const c = new Core();
  const key = c.begin(c.evaluate(ACT, PERMIT), ACT);
  c.release(key);
  assert.throws(() => { "use strict"; c.lastAction.executed = "now"; });
});

test("P8. the lock is still held between complete() and release()", () => {
  const c = new Core();
  const key = c.begin(c.evaluate(ACT, PERMIT), ACT);
  c.complete(key, "done");
  // Completing is not releasing: a second action must still be refused.
  const second = c.evaluate(ACT, PERMIT);
  assert.strictEqual(second.decision, "HOLD");
  assert.ok(second.reasons.some((x) => x.includes("Gate 14")));
  assert.strictEqual(c.begin(second), null);
});

// -------------------------------------------------------- freezing, time

test("P9. the reasons array of a verdict cannot be appended to afterwards", () => {
  const c = new Core();
  const r = c.evaluate({ source: "UNKNOWN" }, {});
  assert.throws(() => { "use strict"; r.reasons.push("invented"); });
});

test("P10. a permit stamped in the future is not accepted as fresh", () => {
  const c = new Core();
  const tomorrow = new Date(Date.now() + 86400000).toISOString();
  const r = c.evaluate(ACT, { ...PERMIT, permitTimestamp: tomorrow });
  assert.strictEqual(r.decision, "HOLD",
    "a permit dated in the future should not pass as a current one");
});

// ------------------------------------------------------- the trust seam

test("P11. a hand-made object claiming CLEAR cannot take the action lock", () => {
  const c = new Core();
  const forged = Object.freeze({ decision: "CLEAR" });
  assert.strictEqual(c.begin(forged), null,
    "begin() should require a verdict the Core itself produced");
});

test("P12. a verdict cannot be spent on a proposal that changed after it", () => {
  // Defect #13. Closing #5 established WHO issued a verdict and stopped there.
  // A verdict for a transfer of 100 could be carried to begin() after the
  // proposal had become 1,000,000 with a different signature, and the lock
  // opened — because nothing tied the permission to the thing it permitted.
  //
  // Named in the compositional-policy literature as "a threshold checked,
  // after which the value changes again", and found here by testing this
  // repository against that description.
  const c = new Core();
  const proposal = { ...ACT, amount: 100 };
  const verdict = c.evaluate(proposal, PERMIT);
  assert.strictEqual(verdict.decision, "CLEAR");

  proposal.amount = 1_000_000;
  proposal.targetSignature = "SOMETHING ELSE";

  assert.strictEqual(c.begin(verdict, proposal), null,
    "a permission belongs to what it permitted; if that moved, it did not");

  // And the unchanged case still works, so the check is not simply refusing.
  const d = new Core();
  const clean = { ...ACT, amount: 100 };
  assert.ok(d.begin(d.evaluate(clean, PERMIT), clean),
    "an unchanged proposal must still be able to take the lock");
});
