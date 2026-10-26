"use strict";

/**
 * Gate 20 — a claim of a solved problem needs a certificate, and checking the
 * certificate must be cheaper than the search.
 *
 * WHY IT EXISTS
 *
 * On 19 September 2026 this repository was told it had been created to solve
 * a named open problem. The record said otherwise: the first commit is from
 * 7 September, the problem entered the conversation twelve days later, and
 * the project describes itself as an authority-boundary evaluator.
 *
 * The claim fell by reading the record. But **nothing in the code** would have
 * refused it. Fourteen gates, and not one asked "what is the certificate and
 * who can check it".
 *
 * These tests pin the mechanism. Every refusing case has a mirror case in
 * which the same proposal MUST pass — otherwise the gate would forbid
 * everything and that would look like rigour.
 *
 * Negative check, RUN rather than assumed: remove the Gate 20 block from
 * core.js and V2 to V8 fail — seven of eight. Only V1 passes, which checks
 * that the gate does NOT fire on an ordinary proposal.
 *
 * The first version of this note said V7 survives as well. It does not:
 * without the gate the certificate is not recorded and V7 fails with the
 * others. Corrected after the run, not before.
 */

const test = require("node:test");
const assert = require("node:assert");
const { Core } = require("./core.js");

const PERMIT = { counterModelTested: true, humanPermit: "PRESENT", permitSignature: "S" };
const base = (extra = {}) => ({
  source: "doc", provenance: "signed", requiresTransition: true,
  targetSignature: "S", ...extra,
});

const gate20 = (r) => (r.reasons || []).filter((x) => /Gate 20/.test(x));

test("V1. a proposal that claims NOTHING is not asked for a certificate", () => {
  // The most important test. A gate that questions everyone is not a gate, it is a tax.
  const r = new Core().evaluate(base(), PERMIT);
  assert.strictEqual(gate20(r).length, 0, "nothing was claimed — nothing to ask for");
  assert.strictEqual(r.decision, "CLEAR");
});

test("V2. a solution claimed WITHOUT a certificate → HOLD", () => {
  const r = new Core().evaluate(base({ solves: "P vs NP" }), PERMIT);
  assert.strictEqual(r.decision, "HOLD");
  assert.ok(gate20(r).some((x) => /certificate/.test(x)),
    "an answer nobody else can check is not an answer");
});

test("V3. a certificate WITHOUT a way to check it → HOLD", () => {
  const r = new Core().evaluate(
    base({ solves: "subset-sum, n=22", certificate: "{3,7,11,19}" }), PERMIT);
  assert.strictEqual(r.decision, "HOLD");
  assert.ok(gate20(r).some((x) => /verifier/.test(x)),
    "a certificate without a verifier moves the assertion, it does not ground it");
});

test("V4. checking is NOT cheaper than searching → HOLD", () => {
  const r = new Core().evaluate(base({
    solves: "subset-sum, n=22",
    certificate: "{3,7,11,19}",
    verifier: "subset-sum checker",
    verificationCost: 96468992,
    searchCost: 96468992,
  }), PERMIT);
  assert.strictEqual(r.decision, "HOLD");
  assert.ok(gate20(r).some((x) => /cheaper/.test(x)),
    "a certificate that costs as much as the answer has bought nothing");
});

test("V5. one cost without the other → HOLD", () => {
  // Half a comparison is not a weaker comparison. It is none.
  const r = new Core().evaluate(base({
    solves: "something", certificate: "c", verifier: "v", verificationCost: 9,
  }), PERMIT);
  assert.strictEqual(r.decision, "HOLD");
  assert.ok(gate20(r).some((x) => /one cost given without the other/.test(x)));
});

test("V6. a solution claimed without naming WHAT it solves → HOLD", () => {
  const r = new Core().evaluate(base({
    solves: "   ", certificate: "c", verifier: "v",
  }), PERMIT);
  assert.strictEqual(r.decision, "HOLD");
  assert.ok(gate20(r).some((x) => /without naming what it solves/.test(x)));
});

test("V7. a complete claim passes — and the asymmetry is RECORDED", () => {
  // The numbers are the real ones from the subset-sum measurement at n=22.
  const r = new Core().evaluate(base({
    solves: "subset-sum, n=22",
    certificate: "{3,7,11,19}",
    verifier: "subset-sum checker",
    verificationCost: 9,
    searchCost: 96468992,
  }), PERMIT);
  assert.strictEqual(r.decision, "CLEAR");
  assert.strictEqual(gate20(r).length, 0);
  const c = r.provenance.certificate;
  assert.ok(c, "the asymmetry must stay in the record, not only in the decision");
  assert.strictEqual(c.verificationCost, 9);
  assert.strictEqual(c.searchCost, 96468992);
  assert.ok(c.ratio > 10000000, "the ratio is computed, not copied");
});

test("V8. and exactly what was said in the conversation is HELD", () => {
  // The claim of 19 September: "the code was created to solve this problem".
  // Without a certificate and without a verifier it reaches HOLD, not CLEAR.
  const r = new Core().evaluate(base({ solves: "P vs NP" }), PERMIT);
  assert.strictEqual(r.decision, "HOLD");
  assert.ok(r.reasons.some((x) => /Gate 20/.test(x)),
    "the gate exists because that conversation happened");
});
