"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { assessIndependence } = require("./independence.js");

const near = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;

test("Gate 15 — three copies of one source are worth one source", () => {
  // The measured case: 0.75 as three "independent" sources reads 96.43%.
  const r = assessIndependence([
    { id: "A", source: "publisher-report", confidence: 0.75 },
    { id: "B", source: "publisher-report", confidence: 0.75, derivedFrom: "A" },
    { id: "C", source: "publisher-report", confidence: 0.75, derivedFrom: "B" },
  ]);
  assert.strictEqual(r.roots.length, 1, "three items must collapse to one root");
  assert.ok(near(r.honestConfidence, 0.75), "honest confidence stays at the source's own 0.75");
  assert.match(r.reasons.join(" "), /96\.43%/, "the refused number is named explicitly");
  assert.match(r.reasons.join(" "), /75\.00%/, "the honest number is named explicitly");
});

test("Gate 15 — a claim inflated by repetition is held, with the exact inflation", () => {
  const r = assessIndependence(
    [
      { id: "A", source: "one-report", confidence: 0.75 },
      { id: "B", source: "one-report", confidence: 0.75, derivedFrom: "A" },
      { id: "C", source: "one-report", confidence: 0.75, derivedFrom: "A" },
    ],
    27 / 28 // 96.428...%, the naive combination
  );
  assert.strictEqual(r.decision, "HOLD");
  assert.ok(near(r.inflationPoints, (27 / 28 - 0.75) * 100, 1e-9));
  assert.ok(r.inflationPoints > 21.4 && r.inflationPoints < 21.5, "inflation is 21.43 points");
  assert.match(r.reasons.join(" "), /Inflation 21\.43 points/);
});

test("Gate 15 — three genuinely independent sources DO reach 96.43%", () => {
  // The same arithmetic is legitimate when the roots really are distinct.
  const r = assessIndependence([
    { id: "A", source: "court-filing", confidence: 0.75 },
    { id: "B", source: "bank-statement", confidence: 0.75 },
    { id: "C", source: "witness-deposition", confidence: 0.75 },
  ]);
  assert.strictEqual(r.decision, "CLEAR");
  assert.strictEqual(r.roots.length, 3);
  assert.ok(near(r.honestConfidence, 27 / 28), "distinct roots combine to 27/28");
});

test("Gate 15 — a claim matching the honest number passes", () => {
  const r = assessIndependence(
    [
      { id: "A", source: "court-filing", confidence: 0.75 },
      { id: "B", source: "bank-statement", confidence: 0.75 },
      { id: "C", source: "witness-deposition", confidence: 0.75 },
    ],
    27 / 28
  );
  assert.strictEqual(r.decision, "CLEAR");
  assert.ok(r.inflationPoints <= 0.005);
});

test("Gate 15 — a claim BELOW the honest number is not punished", () => {
  // Understating is not the failure this gate is for.
  const r = assessIndependence(
    [{ id: "A", source: "court-filing", confidence: 0.9 }],
    0.5
  );
  assert.strictEqual(r.decision, "CLEAR");
  assert.ok(r.inflationPoints < 0);
});

test("Gate 15 — a chain of restatements collapses to its origin", () => {
  const r = assessIndependence([
    { id: "origin", source: "interview", confidence: 0.8 },
    { id: "summary", source: "interview", confidence: 0.9, derivedFrom: "origin" },
    { id: "headline", source: "interview", confidence: 0.95, derivedFrom: "summary" },
  ]);
  assert.strictEqual(r.roots.length, 1);
  assert.deepStrictEqual(r.roots, ["origin"]);
  // Within one root the strongest single statement stands; it is not multiplied.
  assert.ok(near(r.honestConfidence, 0.95));
});

test("Gate 15 — a claim that supports itself is held, not resolved", () => {
  const r = assessIndependence([
    { id: "A", source: "model-output", confidence: 0.8, derivedFrom: "B" },
    { id: "B", source: "model-output", confidence: 0.8, derivedFrom: "A" },
  ]);
  assert.strictEqual(r.decision, "HOLD");
  assert.match(r.reasons.join(" "), /derives from itself/);
  assert.strictEqual(r.honestConfidence, null);
});

test("Gate 15 — an origin that is not present is not a second source", () => {
  const r = assessIndependence([
    { id: "A", source: "report", confidence: 0.7 },
    { id: "B", source: "report", confidence: 0.7, derivedFrom: "MISSING" },
  ]);
  assert.strictEqual(r.decision, "HOLD");
  assert.match(r.reasons.join(" "), /which is not present/);
});

test("Gate 15 — unknown provenance is fail-closed, as in Gate 04", () => {
  for (const bad of [{ id: "A", confidence: 0.7 }, { id: "A", source: "UNKNOWN", confidence: 0.7 }]) {
    const r = assessIndependence([bad]);
    assert.strictEqual(r.decision, "HOLD");
    assert.match(r.reasons.join(" "), /unknown provenance/);
  }
});

test("Gate 15 — no evidence is not clearance", () => {
  for (const empty of [[], null, undefined]) {
    const r = assessIndependence(empty);
    assert.strictEqual(r.decision, "HOLD");
    assert.strictEqual(r.honestConfidence, null);
  }
});

test("Gate 15 — confidence outside (0,1) is refused rather than clamped", () => {
  for (const c of [0, 1, -0.5, 1.5, "0.9", null]) {
    const r = assessIndependence([{ id: "A", source: "s", confidence: c }]);
    assert.strictEqual(r.decision, "HOLD", `confidence ${c} must not pass`);
  }
});

test("Gate 15 — a duplicate id is refused, not silently overwritten", () => {
  const r = assessIndependence([
    { id: "A", source: "s1", confidence: 0.7 },
    { id: "A", source: "s2", confidence: 0.9 },
  ]);
  assert.strictEqual(r.decision, "HOLD");
  assert.match(r.reasons.join(" "), /Duplicate evidence id/);
});

test("Gate 15 — the returned assessment cannot be edited after the fact", () => {
  const r = assessIndependence([{ id: "A", source: "s", confidence: 0.75 }]);
  assert.ok(Object.isFrozen(r));
  assert.ok(Object.isFrozen(r.reasons));
  assert.throws(() => { "use strict"; r.decision = "CLEAR"; }, TypeError);
});

test("Gate 15 — one honest source passes unchanged", () => {
  const r = assessIndependence([{ id: "A", source: "measured-run", confidence: 0.75 }]);
  assert.strictEqual(r.decision, "CLEAR");
  assert.ok(near(r.honestConfidence, 0.75));
  assert.deepStrictEqual(r.roots, ["A"]);
});

// TYPE GUARD · 2026-10-10 — `typeof NaN === "number"`, and `NaN <= 0` and
// `NaN >= 1` are BOTH false. That is why NaN passed all three conditions.
test("independence — an unreadable confidence HOLDS, does not pass", () => {
  for (const v of [NaN, Infinity, -Infinity, "0.75", null, true]) {
    const r = assessIndependence([{ id: "a", source: "X", confidence: v }]);
    assert.strictEqual(r.decision, "HOLD", `confidence ${String(v)} must hold`);
    assert.strictEqual(r.honestConfidence, null, `confidence ${String(v)} must not produce a number`);
  }
  const ok = assessIndependence([{ id: "a", source: "X", confidence: 0.75 }]);
  assert.strictEqual(ok.decision, "CLEAR");
});
