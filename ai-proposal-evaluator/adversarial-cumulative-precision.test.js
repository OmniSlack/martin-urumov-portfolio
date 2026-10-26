"use strict";

/**
 * PROBE 9 — defect #21: Gate 19's accounting was not exact.
 *
 * Found on 20 September 2026 by the supercriticality probe. It was not looking
 * for this; it was checking whether anything bounds the number of attempts.
 * The number that came out on the side:
 *
 *   LIMIT = 100, step 0.1
 *   executed = 1000   sum = 99.9999999999986
 *
 * The exact sum of 1000 × 0.1 is 100. Gate 19 compared a drifted sum with an
 * exact limit, and the limit came out shifted by 1.4e-12 — in the direction
 * that LETS THROUGH. The direction is not controlled: at 1e6 × 1e-7 the drift
 * is upward.
 *
 * Same class as defect #16 — something that LOOKS like an exact bound and is
 * not — in the gate whose only job is exact counting.
 *
 * NEGATIVE CHECK. Revert `neumaierSum` to `.reduce((t,v)=>t+v,0)` and P1, P2,
 * P3 and P4 must fail. Shown on 20 September; if they do not fail, the test
 * checks nothing.
 */

const test = require("node:test");
const assert = require("node:assert");
const { Core } = require("./core.js");

const BASE = { counterModelTested: true };
const OK = { source: "doc", provenance: "signed", targetSignature: "S" };

/** Executes n actions of `step` on ONE Core and returns the instance. */
function spend(core, n, step) {
  for (let i = 0; i < n; i++) {
    const p = { ...OK, amount: step };
    const k = core.begin(core.evaluate(p, { ...BASE }), p);
    if (k === null) throw new Error(`the lock was not taken at step ${i}`);
    core.complete(k, "done");
    core.release(k);
  }
  return core;
}

/** How much Gate 19 counts as spent, read from its own record. */
function spentPerGate(core, limit = 1e9) {
  const p = { ...OK, amount: 0 };
  const v = core.evaluate(p, {
    ...BASE, cumulativeLimit: limit, cumulativeField: "amount",
  });
  return v.provenance.cumulative.spent;
}

test("P1. 1000 actions of 0.1 give exactly 100, not 99.9999999999986", () => {
  const spent = spentPerGate(spend(new Core(), 1000, 0.1));
  assert.strictEqual(spent, 100,
    `Naive summation gave 99.9999999999986. The difference of 1.4e-12 is ` +
    `in the direction that lets through: a limit of 100 accepted one more action.`);
});

test("P2. 300 actions of 0.7 give exactly 210", () => {
  const spent = spentPerGate(spend(new Core(), 300, 0.7));
  assert.strictEqual(spent, 210, "naive gave 209.99999999999903");
});

test("P3. the limit HOLDS under exact accumulation", () => {
  // 1000 × 0.1 = 100 against a limit of 100. The next action, however small,
  // MUST be held. Before the fix the sum was below 100 and it passed.
  //
  // The size is chosen to BITE. The first version asked for 1e-9 — a thousand
  // times larger than the 1.4e-12 drift — and so was held under both
  // summations. A test that passes when broken checks nothing. Here the
  // request is SMALLER than the drift: naive passes, compensated holds.
  const core = spend(new Core(), 1000, 0.1);
  const p = { ...OK, amount: 1e-13 };
  const v = core.evaluate(p, {
    ...BASE, cumulativeLimit: 100, cumulativeField: "amount",
  });
  assert.strictEqual(v.decision, "HOLD");
  assert.ok(v.reasons.some((r) => /Gate 19/.test(r)),
    "the hold must come FROM Gate 19, not by accident from another gate");
});

test("P4. exactly at the edge is accepted, not refused because of noise", () => {
  // The opposite error is just as bad: an UPWARD drift would refuse an action
  // the policy allows. Here the sum is exactly 10 against a limit of 10 and a
  // zero request — it passes.
  const core = spend(new Core(), 10000, 0.001);
  const v = core.evaluate({ ...OK, amount: 0 }, {
    ...BASE, cumulativeLimit: 10, cumulativeField: "amount",
  });
  assert.strictEqual(v.provenance.cumulative.spent, 10,
    "naive gave 9.999999999999897");
  assert.strictEqual(v.decision, "CLEAR");
});

test("P5. the LIMIT of the fix is kept, not hidden", () => {
  // The fix cures ACCUMULATION, not REPRESENTATION. These are two different
  // errors and only the first goes away.
  //
  // Three actions of 0.1 give 0.30000000000000004 — compensated and naive
  // alike, because 0.1 itself is not exactly representable as a double. No
  // summation can fix that; it needs scaled integers.
  //
  // The first version of this test claimed the opposite for 100000 × 1e-7 and
  // failed, because there the sum comes out EXACTLY 0.01. The number corrected
  // the author, not the other way round.
  //
  // The test stays so that nobody can later write in a document that Gate 19
  // counts "exactly" without this caveat.
  const spent = spentPerGate(spend(new Core(), 3, 0.1));
  assert.notStrictEqual(spent, 0.3,
    "0.1 is not exactly representable; 3 × 0.1 cannot give the decimal 0.3");
  assert.strictEqual(spent, 0.30000000000000004,
    "this is the correctly rounded sum of the actual doubles — the best possible");
});

test("P6. incomplete records are not counted — proposed is not spent", () => {
  // The fix must not change WHAT is counted, only HOW it is summed.
  const core = new Core();
  spend(core, 5, 10);                  // 50, executed
  const p = { ...OK, amount: 1000 };   // taken and released WITHOUT complete
  const k = core.begin(core.evaluate(p, { ...BASE }), p);
  core.release(k);
  assert.strictEqual(spentPerGate(core), 50,
    "an action that was proposed and not carried out has spent nothing");
});
