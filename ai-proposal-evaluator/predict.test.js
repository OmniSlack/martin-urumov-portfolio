"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { predict, manifest, score, report } = require("./predict.js");

const base = {
  id: "P1",
  quantity: "orbital period",
  value: 365.25,
  unit: "days",
  tolerance: 0.01,
  method: "derived from the model, answer not consulted",
  observedAvailable: false,
};

test("Gate 16 — a complete prediction seals", () => {
  const p = predict(base);
  assert.strictEqual(p.decision, "CLEAR");
  assert.match(p.seal, /^[0-9a-f]{64}$/);
  assert.strictEqual(p.retrospective, false);
});

test("Gate 16 — a number without a unit is not a claim", () => {
  const p = predict({ ...base, unit: "" });
  assert.strictEqual(p.decision, "HOLD");
  assert.strictEqual(p.seal, null);
  assert.match(p.reasons.join(" "), /"unit" is missing/);
});

test("Gate 16 — tolerance must be fixed now, and be a fraction", () => {
  for (const t of [0, 1, -0.1, 1.5, "0.01", undefined]) {
    assert.strictEqual(predict({ ...base, tolerance: t }).decision, "HOLD", `tolerance ${t}`);
  }
});

test("Gate 16 — an unanswered question about the answer is not an answer of no", () => {
  const { observedAvailable, ...rest } = base;
  const p = predict(rest);
  assert.strictEqual(p.decision, "HOLD");
  assert.match(p.reasons.join(" "), /Unanswered is not an answer of no/);
});

test("Gate 16 — a hit requires the seal to precede the observation", () => {
  const p = predict(base);
  const s = score(p, 365.2422);
  assert.strictEqual(s.withinTolerance, true);
  assert.strictEqual(s.hit, true);
  assert.ok(s.relError < 0.0001);
});

test("Gate 16 — right answer, looked up first, is never a hit", () => {
  const p = predict({ ...base, observedAvailable: true });
  const s = score(p, 365.2422);
  assert.strictEqual(p.retrospective, true);
  assert.strictEqual(s.withinTolerance, true, "the number is still correct");
  assert.strictEqual(s.hit, false, "but it does not count");
  assert.match(s.reasons.join(" "), /Not counted as a hit/);
});

test("Gate 16 — a miss is a miss, and the error is stated", () => {
  const p = predict(base);
  const s = score(p, 300);
  assert.strictEqual(s.hit, false);
  assert.ok(Math.abs(s.relError - 65.25 / 300) < 1e-12);
});

test("Gate 16 — editing a sealed prediction is STOP, not HOLD", () => {
  const p = predict(base);
  const forged = { ...p, value: 365.2422 }; // the answer, written in afterwards
  const s = score(forged, 365.2422);
  assert.strictEqual(s.decision, "STOP");
  // This asserted hit === false until 18 September 2026, which said the forged
  // prediction had been scored and had missed. It had not been scored at all:
  // the seal did not match, so there is no verdict to give. Counting an
  // invalid record as a wrong one is the same conflation as defect #9 seen
  // from the other side — a record with no answer reported as an answer.
  assert.strictEqual(s.hit, null, "a broken seal yields no verdict, not a miss");
  assert.match(s.reasons.join(" "), /altered after sealing/);
});

test("Gate 16 — an unsealed prediction cannot be scored", () => {
  const p = predict({ ...base, unit: "" });
  assert.strictEqual(score(p, 1).decision, "HOLD");
  assert.strictEqual(score(null, 1).decision, "HOLD");
});

test("Gate 16 — the manifest is stable and hashable", () => {
  const ps = [predict(base), predict({ ...base, id: "P2", value: 88 })];
  const m1 = manifest(ps);
  const m2 = manifest([ps[1], ps[0]]); // different order, same content
  assert.strictEqual(m1.sha256, m2.sha256, "order must not change the hash");
  assert.strictEqual(m1.count, 2);
  assert.match(m1.text, /365\.25 days/);
});

test("Gate 16 — unsealed predictions never reach the manifest", () => {
  const m = manifest([predict(base), predict({ ...base, id: "bad", tolerance: 0 })]);
  assert.strictEqual(m.count, 1);
});

test("Gate 16 — the report separates what was predicted from what was not", () => {
  const scored = [
    score(predict({ ...base, id: "A" }), 365.2422),                       // hit
    score(predict({ ...base, id: "B", value: 300 }), 365.2422),           // miss
    score(predict({ ...base, id: "C", observedAvailable: true }), 365.24) // retrospective
  ];
  const r = report(scored);
  assert.strictEqual(r.predictedInAdvance, 2);
  assert.strictEqual(r.hits, 1);
  assert.strictEqual(r.hitRate, 0.5);
  assert.strictEqual(r.retrospective, 1);
  assert.strictEqual(r.worst, "B");
  assert.match(r.note, /1 of 2 sealed before observation/);
});

test("Gate 16 — a record with nothing predicted in advance says so", () => {
  const r = report([score(predict({ ...base, observedAvailable: true }), 365.24)]);
  assert.strictEqual(r.hitRate, null);
  assert.match(r.note, /says nothing about the method/);
});

test("Gate 16 — sealed records cannot be edited in place", () => {
  const p = predict(base);
  assert.ok(Object.isFrozen(p));
  assert.throws(() => { "use strict"; p.value = 1; }, TypeError);
});

// TYPE GUARD · 2026-10-10 — the check looked only at `undefined`, so
// `observedAvailable: "yes"` was neither "yes" nor missing, and silently became
// "no". A prediction made with a known answer could be sealed as genuine.
test("Gate 16 — an unreadable observedAvailable HOLDS, is not read as \"no\"", () => {
  for (const v of ["yes", "true", "no", 1, 0, null]) {
    const p = predict({ ...base, observedAvailable: v });
    assert.strictEqual(p.decision, "HOLD", `observedAvailable ${JSON.stringify(v)} must hold`);
    assert.match(p.reasons.join(" "), /must be true or false/);
  }
  assert.strictEqual(predict({ ...base, observedAvailable: false }).decision, "CLEAR");
  assert.strictEqual(predict({ ...base, observedAvailable: true }).decision, "CLEAR");
});
