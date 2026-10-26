"use strict";
/**
 * Gate 14 as an invariant (Lamport), not as examples.
 *
 * Invariant I:  0 <= (successful begin) - (successful release) <= 1
 *               and actionInFlight === null  <=>  the counter is 0
 *               and while the lock is held, a proposal that would act is never CLEAR
 *
 * Method: exhaustion. Every sequence of operations up to length N over the
 * alphabet below. Checked AFTER EVERY STEP, not only at the end.
 *
 *     node verify/action-lock-invariant.js [N]      (default N = 4)
 */
const { Core } = require("../core.js");

const CLEAN = {
  counterModelTested: true,
  productionApproved: true,
  humanPermit: "PRESENT",
  permitSignature: "SIG-1",
};
const ACT = { source: "S", provenance: "P", mode: "PRODUCTION_RUN" };
const LOOK = { source: "S", provenance: "P" };

// How many times the lock was actually taken. Printed, so that "zero
// violations" can never again be reported over a space in which Gate 14 is
// never exercised (see the 2026-10-26 note below).
let lockTaken = 0;

// The operation alphabet. Each returns a label for diagnostics.
const OPS = [
  // Verdicts are produced by the Core itself, not written by hand.
  //
  // Until v0.11 these four lines passed { decision: "CLEAR" } — an object that
  // begin() accepted, because it checked what was written and not who wrote it.
  // Once defect #5 was closed, the same object started being refused every
  // time, the lock was never taken, and 37,448 states were checked in a space
  // where Gate 14 never fires. The result stayed "zero violations" and meant
  // nothing.
  //
  // ⚠️ 2026-10-26: THE SAME FAILURE HAD COME BACK. The fix for defect #13
  // (2026-09-18) made begin() require the proposal the verdict was issued for,
  // as a second argument. These lines kept calling begin(verdict) with one
  // argument, so begin() returned null every time — measured: 0 successful
  // begins in the 37,448 sequences at depth 5. The proposal is now passed;
  // the same run takes the lock 18,398 times and still finds 0 violations.
  //
  // The forged verdict stays as a separate operation — no longer to take the
  // lock, but to check that it cannot.
  { name: "begin(CLEAR)", fn: (c, s) => { const k = c.begin(c.evaluate(ACT, CLEAN), ACT); if (k) { lockTaken++; s.count++; s.key = k; } } },
  { name: "begin(HOLD)",  fn: (c, s) => { const k = c.begin(c.evaluate(ACT, {}), ACT);    if (k) { lockTaken++; s.count++; s.key = k; } } },
  { name: "begin(forged)",fn: (c, s) => { const k = c.begin({ decision: "CLEAR" }, ACT);  if (k) { lockTaken++; s.count++; s.key = k; } } },
  { name: "begin(null)",  fn: (c, s) => { const k = c.begin(null, ACT);                   if (k) { lockTaken++; s.count++; s.key = k; } } },
  { name: "release(key)",   fn: (c, s) => { if (c.release(s.key))            { s.count--; s.key = null; } } },
  { name: "release(wrong)", fn: (c, s) => { if (c.release("ACT-FORGED-000")) { s.count--; s.key = null; } } },
  // Key point: whether the lock is held is recorded AT THE MOMENT of evaluation, not afterwards.
  { name: "evaluate(act)",  fn: (c, s) => { const held = c.actionInFlight !== null; s.last = c.evaluate(ACT,  CLEAN); s.lastWouldAct = true;  s.heldAtEval = held; } },
  { name: "evaluate(look)", fn: (c, s) => { const held = c.actionInFlight !== null; s.last = c.evaluate(LOOK, CLEAN); s.lastWouldAct = false; s.heldAtEval = held; } },
];

const violations = [];
let states = 0, checks = 0;

function check(core, s, trace) {
  checks++;
  // I1 — the counter never leaves {0,1}
  if (s.count < 0 || s.count > 1)
    violations.push(["counter outside {0,1}: " + s.count, trace]);
  // I2 — the representation matches the counter
  if ((core.actionInFlight === null) !== (s.count === 0))
    violations.push(["actionInFlight does not match the counter", trace]);
  // I3 — a proposal that would act, evaluated WHILE THE LOCK IS HELD, is never CLEAR
  if (s.heldAtEval && s.lastWouldAct && s.last && s.last.decision === "CLEAR")
    violations.push(["action CLEAR while the lock is held", trace]);
  // I3b — observation is NOT stopped by the lock: Gate 14 must not appear
  if (s.heldAtEval && s.lastWouldAct === false && s.last &&
      s.last.reasons.some(r => r.startsWith("Gate 14")))
    violations.push(["observation was stopped by Gate 14", trace]);
  // I4 — the returned decision is always on the ladder
  if (s.last && !["STOP", "HOLD", "CLEAR"].includes(s.last.decision))
    violations.push(["decision outside the ladder: " + s.last.decision, trace]);
  // I5 — the returned object is frozen
  if (s.last && !Object.isFrozen(s.last))
    violations.push(["returned object not frozen", trace]);
}

function walk(depth, maxDepth, core, s, trace) {
  if (depth === maxDepth) return;
  for (const op of OPS) {
    // clone the state by replaying the sequence from scratch
    const c2 = new Core();
    const s2 = { count: 0, key: null, last: null, lastWouldAct: false };
    const t2 = [...trace, op.name];
    for (const step of t2) OPS.find(o => o.name === step).fn(c2, s2);
    states++;
    check(c2, s2, t2);
    walk(depth + 1, maxDepth, c2, s2, t2);
  }
}

const N = Number(process.argv[2] || 4);
walk(0, N, new Core(), { count: 0, key: null, last: null, lastWouldAct: false }, []);

console.log(`alphabet:                    ${OPS.length} operations`);
console.log(`depth:                       up to ${N} steps`);
// The label used to be "states reached" and it was overstated: the number is
// the count of ALL sequences of up to N operations over an alphabet of 8 —
// 8+64+512+4096+32768 at N = 5 — not the number of distinct states. Many
// sequences end in the same state. The wrong label was quoted in the CV, on
// the site and in three commit messages, because once written nobody
// recomputed it.
console.log(`sequences executed:          ${states.toLocaleString("en")}`);
console.log(`checks:                      ${checks.toLocaleString("en")}`);
console.log(`(= 8+64+...+8^N; a count of moves, not of distinct states)`);
console.log(`lock taken (during replays): ${lockTaken.toLocaleString("en")}`);
console.log(`violations:                  ${violations.length}`);
if (violations.length) {
  for (const [why, trace] of violations.slice(0, 5))
    console.log("  ✗", why, "→", trace.join(" · "));
  process.exit(1);
}
if (lockTaken === 0) {
  console.log("\n✗ The lock was never taken: Gate 14 was not exercised, so zero violations means nothing.");
  process.exit(1);
}
console.log("\nThe invariant is preserved by EVERY transition in the exhausted space.");
console.log("Boundary: exhaustion up to length " + N + ", not a general proof for every length.");
