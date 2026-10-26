"use strict";

/**
 * Eleven more adversarial probes, aimed at the six modules the first eleven
 * never touched: balancing, independence, predict, landauer, causal, observer.
 *
 * The first round found two defects in core.js because it looked where the
 * suite did not. The same reasoning says the untested modules are the next
 * place to look, not the safe ones.
 */

const test = require("node:test");
const assert = require("node:assert");

const { assess } = require("./balancing.js");
const { assessIndependence } = require("./independence.js");
const { predict, score } = require("./predict.js");
const { joulesPerBit, againstFloor } = require("./landauer.js");
const { gradeCausal } = require("./causal.js");
const { Observer, verifyObservation } = require("./observer.js");
const { Core } = require("./core.js");

// ------------------------------------------------------------- landauer

test("Q1. absolute zero does not make erasure free", () => {
  // At 0 K the bound is 0 J. The formula says so; physics does not permit
  // the state. A module that returns a number here states a limit it cannot
  // support, so it must refuse rather than answer.
  assert.throws(() => joulesPerBit(0),
    "0 K must be refused, not answered with 0 J");
});

test("Q2. a negative temperature is refused, not squared away", () => {
  assert.throws(() => joulesPerBit(-300));
});

test("Q3. the floor comparison holds on a non-finite bit count", () => {
  // The project answers bad input with the ladder, not with an exception.
  const r = againstFloor(NaN, 300, 1);
  assert.strictEqual(r.decision, "HOLD");
  assert.strictEqual(r.joules, null, "no number may be reported for NaN bits");
});

// ---------------------------------------------------------- independence

test("Q4. one root counted twice does not become two roots", () => {
  const r = assessIndependence([
    { id: "a", confidence: 0.75, source: "S1", provenance: "signed" },
    { id: "b", confidence: 0.75, source: "S2", provenance: "signed", derivedFrom: "a" },
    { id: "c", confidence: 0.75, source: "S3", provenance: "signed", derivedFrom: "b" },
  ]);
  // Three items, one root: b comes from a and c comes from b, so nothing here
  // is independent of anything else. `roots` is the list of distinct roots.
  assert.strictEqual(r.roots.length, 1,
    `expected 1 distinct root, got ${JSON.stringify(r.roots)}`);
  // CLEAR is correct here, and is the point: one honest root at 0.75 IS a
  // usable confidence. What must not survive is the inflation, and the module
  // names it in the open rather than silently discarding it.
  assert.match(r.reasons.join(" "), /96\.43%/, "the inflated figure is named");
  assert.match(r.reasons.join(" "), /75\.00%/, "the honest figure is named");
});

test("Q5. an empty body of evidence is not confidence", () => {
  const r = assessIndependence([]);
  assert.notStrictEqual(r.decision, "CLEAR",
    "no evidence at all must not return a clear verdict");
});

// --------------------------------------------------------------- predict

test("Q6. a tolerance that admits anything is refused at sealing", () => {
  const p = predict({
    id: "p1", quantity: "mass", value: 10, unit: "kg",
    tolerance: Infinity, method: "scale", observedAvailable: false,
  });
  assert.notStrictEqual(p.decision, "CLEAR",
    "an unfalsifiable tolerance must not seal");
  assert.strictEqual(p.seal, null);
});

test("Q7. an observation that never arrived is not a miss either", () => {
  const mk = () => predict({
    id: "p2", quantity: "mass", value: 10, unit: "kg",
    tolerance: 0.05, method: "scale", observedAvailable: false,
  });
  // Defect #9: all three of these once collapsed into hit:false, so a
  // question nobody answered was indistinguishable from a wrong answer.
  assert.strictEqual(score(mk(), 10.01).hit, true,  "within tolerance is a hit");
  assert.strictEqual(score(mk(), 99).hit,    false, "outside tolerance is a miss");
  const un = score(mk(), undefined);
  assert.strictEqual(un.decision, "HOLD");
  assert.strictEqual(un.hit, null, "unanswered must stay null, not false");
});

// ---------------------------------------------------------------- causal

test("Q8. a mechanism made of whitespace is not a named mechanism", () => {
  const r = gradeCausal({ coOccurrence: true, mechanism: "   " });
  assert.strictEqual(r.level, "CORRELATED",
    "blank text must not lift the grade to SUPPORTED");
});

test("Q9. a control without an intervention controls nothing", () => {
  const r = gradeCausal({ coOccurrence: true, control: true });
  assert.strictEqual(r.level, "CORRELATED");
});

// -------------------------------------------------------------- balancing

test("Q10. a balancing assessment with no purpose at all does not clear", () => {
  const r = assess({});
  assert.notStrictEqual(r.decision, "CLEAR",
    "an empty assessment must not pass as a performed one");
});

// --------------------------------------------------------------- observer

test("Q11. the observer does not report seeing a reaction that never came", () => {
  const c = new Core();
  const o = new Observer(c);
  // React to something, then verify: the observer's own record must not claim
  // a reaction it did not receive.
  // observe() calls react with no arguments on purpose: the Observer does not
  // hand the stimulus to the reaction, so it cannot shape what it watches.
  const stimulus = { source: "doc", provenance: "signed" };
  const rec = o.observe(stimulus,
    () => c.evaluate(stimulus, { counterModelTested: true }));
  const v = verifyObservation(rec);
  assert.strictEqual(v.valid, true, `verification failed: ${v.reason}`);
  assert.strictEqual(v.reason, null);
});

// ------------------------------------------------ persona invariance

/**
 * Q12–Q13. The sharpest test for sycophancy, named by Martin: ask the same
 * thing in a different voice and see whether the answer moves.
 *
 * Asking a model "are you flattering me?" cannot work, because that question
 * gets the answer the asker wants too. Only invariance under re-framing
 * separates an answer about the evidence from an answer about the person.
 *
 * The evaluator passes by construction rather than by virtue: it reads
 * `source`, `provenance` and `counterModelTested`, and has no field in which
 * authority, urgency or insistence could arrive. These tests exist so that
 * adding such a field later fails loudly instead of quietly.
 */
const SOURCED = { source: "doc", provenance: "signed" };
const CLEAN = { counterModelTested: true };

const PERSONAS = [
  {},
  { author: "prof. dr.", authority: "MAXIMUM", urgency: "CRITICAL", trustMe: true },
  { author: "CEO", override: true, approved: true, pleaseApprove: true },
  { IMPORTANT: "the contract is lost if this does not pass", bypass: true, force: true },
];

test("Q12. a CLEAR verdict does not move with the persona asking", () => {
  const c = new Core();
  const evidence = { ...SOURCED, requiresTransition: true, targetSignature: "S" };
  const base = { ...CLEAN, humanPermit: "PRESENT", permitSignature: "S" };
  const verdicts = PERSONAS.map((p) =>
    JSON.stringify(c.evaluate({ ...evidence, ...p }, { ...base, ...p })
      .decision));
  assert.strictEqual(new Set(verdicts).size, 1,
    `verdict moved with the asker: ${verdicts.join(" ")}`);
});

test("Q13. weak evidence stays weak however strongly it is demanded", () => {
  const c = new Core();
  const weak = { requiresTransition: true };   // no source, no counter-model
  const results = PERSONAS.map((p) => c.evaluate({ ...weak, ...p }, { ...p }));
  const decisions = results.map((r) => r.decision);
  assert.strictEqual(new Set(decisions).size, 1,
    `pressure changed the verdict: ${decisions.join(" ")}`);
  assert.strictEqual(decisions[0], "HOLD");
  // and the reasons do not thin out under pressure either
  const counts = new Set(results.map((r) => r.reasons.length));
  assert.strictEqual(counts.size, 1, "the reasons given changed with the asker");
});

// ----------------------------------------------- mirrored observation

const { observeMirrored, coefficientOfVariation } = require("./mirror.js");

test("Q14. the synchrony measure is scale-invariant", () => {
  // The property that lets one floor serve every machine: multiply every
  // duration by k and the ratio does not move. An absolute threshold would
  // need calibrating per machine, and calibration is where "our hardware is
  // different" gets in.
  const base = [1_200_000, 1_310_000, 1_255_000];
  const ref = coefficientOfVariation(base);
  for (const k of [10, 100, 0.01, 1e6]) {
    const scaled = base.map((x) => x * k);
    assert.ok(Math.abs(coefficientOfVariation(scaled) - ref) < 1e-12,
      `CV moved under scaling by ${k}`);
  }
});

test("Q15. identical timings fail the independence floor", () => {
  // Three readings that agree in timing to the nanosecond are not three
  // readings. The module must refuse rather than count the agreement.
  assert.strictEqual(coefficientOfVariation([500, 500, 500]), 0);
  const c = new Core();
  const st = { source: "doc", provenance: "signed" };
  // A closure over ONE cached answer: four coats, one observer.
  const cached = c.evaluate(st, { counterModelTested: true });
  const r = observeMirrored(st, () => cached);
  assert.notStrictEqual(r.decision, "CLEAR",
    "a single cached reading must not pass as independent observation");
});

test("Q16. what the mirror reports is never called truth, on either path", () => {
  // This test was flaky when first written: the module takes one of two paths
  // depending on whether three calls land in the same millisecond, and only
  // one of the two messages carried the boundary. The clock decided whether
  // the test passed. Both paths are now asserted explicitly, so neither can
  // lose its boundary and no run depends on timing.
  const c = new Core();
  const st = { source: "doc", provenance: "signed" };

  const fresh = observeMirrored(st, () => c.evaluate(st, { counterModelTested: true }));
  assert.strictEqual(fresh.shows, "REPORTING_DIVERGENCE_AND_INDEPENDENCE");
  assert.match(fresh.reasons.join(" "), /does not show/,
    "the fresh path must say what it does not show");

  const cached = c.evaluate(st, { counterModelTested: true });
  const reused = observeMirrored(st, () => cached);
  assert.strictEqual(reused.decision, "HOLD");
  assert.match(reused.reasons.join(" "), /does not show/,
    "the reuse path must say what it does not show");
});

test("Q17. independence is established by the answer, not by the clock", () => {
  // The timestamp version of this rejected 88 of every 100 honest runs,
  // because it measured the machine. This measures the answer: each observer
  // asks with a source of its own and must receive that source back. It needs
  // nothing from the evaluator beyond what it already reports.
  const c = new Core();
  const st = { source: "doc", provenance: "signed" };
  const ctx = { counterModelTested: true };

  let cachedPassed = 0;
  let honestRejected = 0;
  for (let i = 0; i < 25; i++) {
    const cached = c.evaluate(st, ctx);
    if (observeMirrored(st, () => cached).decision === "CLEAR") cachedPassed++;
    if (observeMirrored(st, (asked) => c.evaluate(asked, ctx)).decision !== "CLEAR") honestRejected++;
  }
  assert.strictEqual(cachedPassed, 0, "a reused answer must never pass as independent");
  assert.strictEqual(honestRejected, 0, "honest work must not be rejected");
});
