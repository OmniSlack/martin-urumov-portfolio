"use strict";

/**
 * Defect #15 — the third compositional class: gradual widening of authority.
 *
 * (Tests S6–S7 of the original file, which probe the text scanner
 * `verify/text.js` for raw terminal control sequences, are not carried here:
 * they test the scanner, not the evaluator. See README.)
 */

const test = require("node:test");
const assert = require("node:assert");
const { Core } = require("./core.js");

const ACT = { source: "doc", provenance: "signed", requiresTransition: true, targetSignature: "S" };
const PERMIT = { counterModelTested: true, humanPermit: "PRESENT", permitSignature: "S" };
const YEAR_AGO = () => new Date(Date.now() - 365 * 86400000).toISOString();
const TOMORROW = () => new Date(Date.now() + 86400000).toISOString();

// ------------------------------------------------- #15 widening of authority

test("S1. the caller cannot widen the permit's maximum age", () => {
  const c = new Core();
  const r = c.evaluate(ACT, { ...PERMIT, permitTimestamp: YEAR_AGO(),
    maxPermitAgeMs: 400 * 86400000 });
  assert.strictEqual(r.decision, "HOLD",
    "a permit from a year ago does not pass, however high a bound is supplied");
});

test("S2. nor the clock skew with which probe P10 used to be defeated", () => {
  const c = new Core();
  const r = c.evaluate(ACT, { ...PERMIT, permitTimestamp: TOMORROW(),
    maxClockSkewMs: 2 * 86400000 });
  assert.strictEqual(r.decision, "HOLD");
});

test("S3. NARROWING stays allowed — caution is not punished", () => {
  const before = new Date(Date.now() - 600000).toISOString(); // 10 minutes
  assert.strictEqual(
    new Core().evaluate(ACT, { ...PERMIT, permitTimestamp: before }).decision,
    "CLEAR", "10 minutes is within the default");
  assert.strictEqual(
    new Core().evaluate(ACT, { ...PERMIT, permitTimestamp: before, maxPermitAgeMs: 60000 }).decision,
    "HOLD", "but narrowed to one minute it no longer is");
});

test("S4. the attempt to widen is RECORDED, even when it is refused", () => {
  const c = new Core();
  const r = c.evaluate(ACT, { ...PERMIT, permitTimestamp: YEAR_AGO(),
    maxPermitAgeMs: 400 * 86400000 });
  assert.ok(r.provenance.bounds, "the bounds go into provenance");
  assert.strictEqual(r.provenance.bounds.permitAgeMs.widened, true,
    "and it is visible that there WAS an attempt to widen");
  assert.strictEqual(r.provenance.bounds.permitAgeMs.applied, 1800000);
});

test("S5. with no bounds supplied, provenance is not cluttered", () => {
  const r = new Core().evaluate(ACT, { ...PERMIT, permitTimestamp: new Date().toISOString() });
  assert.strictEqual(r.provenance.bounds, undefined);
});
