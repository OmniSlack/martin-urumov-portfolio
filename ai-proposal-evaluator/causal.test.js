"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { gradeCausal, LEVELS } = require("./causal.js");

test("Gate 17 — the ladder has four rungs, in order", () => {
  assert.deepStrictEqual(LEVELS, ["UNKNOWN", "CORRELATED", "SUPPORTED", "VERIFIED"]);
});

test("Gate 17 — nothing shown is UNKNOWN, not a weak yes", () => {
  for (const e of [{}, { coOccurrence: false }, { mechanism: "" }, { control: true }]) {
    const r = gradeCausal(e);
    assert.strictEqual(r.level, "UNKNOWN", JSON.stringify(e));
  }
  assert.match(gradeCausal({}).reasons.join(" "), /not a weak yes/);
});

test("Gate 17 — co-occurrence alone reaches CORRELATED and stops there", () => {
  const r = gradeCausal({ coOccurrence: true });
  assert.strictEqual(r.level, "CORRELATED");
  assert.match(r.missing, /an intervention/);
  assert.match(r.missing, /a named mechanism/);
});

test("Gate 17 — a named mechanism reaches SUPPORTED", () => {
  const r = gradeCausal({ coOccurrence: true, mechanism: "thermal expansion of the seal" });
  assert.strictEqual(r.level, "SUPPORTED");
});

test("Gate 17 — an unnamed mechanism is not a mechanism", () => {
  for (const m of ["", "   ", true, 1, null, undefined, {}]) {
    const r = gradeCausal({ coOccurrence: true, mechanism: m });
    assert.strictEqual(r.level, "CORRELATED", `mechanism=${JSON.stringify(m)}`);
  }
});

test("Gate 17 — a controlled comparison reaches SUPPORTED without a mechanism", () => {
  const r = gradeCausal({ coOccurrence: true, intervention: true, control: true });
  assert.strictEqual(r.level, "SUPPORTED");
  assert.match(r.missing, /a named mechanism/);
});

test("Gate 17 — intervention without a control does not reach SUPPORTED", () => {
  // Changing something and watching what happens is not a controlled comparison.
  const r = gradeCausal({ coOccurrence: true, intervention: true });
  assert.strictEqual(r.level, "CORRELATED");
  assert.match(r.missing, /a control for the intervention/);
});

test("Gate 17 — VERIFIED needs the intervention, the control and the mechanism", () => {
  const full = { coOccurrence: true, intervention: true, control: true, mechanism: "valve seat wear" };
  assert.strictEqual(gradeCausal(full).level, "VERIFIED");
  assert.strictEqual(gradeCausal(full).missing, null);

  // Remove any one of the three and it falls back.
  assert.strictEqual(gradeCausal({ ...full, control: false }).level, "SUPPORTED");
  assert.strictEqual(gradeCausal({ ...full, mechanism: "" }).level, "SUPPORTED");
  assert.strictEqual(gradeCausal({ ...full, intervention: false }).level, "SUPPORTED");
});

test("Gate 17 — claiming above the evidence is held, with the ceiling named", () => {
  const r = gradeCausal({ coOccurrence: true }, "VERIFIED");
  assert.strictEqual(r.decision, "HOLD");
  assert.strictEqual(r.level, "CORRELATED");
  assert.match(r.reasons.join(" "), /VERIFIED claimed, CORRELATED reached/);
  assert.match(r.reasons.join(" "), /Missing:/);
});

test("Gate 17 — claiming exactly what is reached passes", () => {
  const e = { coOccurrence: true, mechanism: "corrosion at the joint" };
  assert.strictEqual(gradeCausal(e, "SUPPORTED").decision, "CLEAR");
});

test("Gate 17 — claiming less than is reached is not an failure", () => {
  const e = { coOccurrence: true, intervention: true, control: true, mechanism: "m" };
  const r = gradeCausal(e, "CORRELATED");
  assert.strictEqual(r.decision, "CLEAR", "understating is not the failure this gate is for");
  assert.strictEqual(r.level, "VERIFIED");
});

test("Gate 17 — a level that is not on the ladder is refused", () => {
  for (const bad of ["PROBABLY", "verified", "PROVEN", 3, {}]) {
    const r = gradeCausal({ coOccurrence: true }, bad);
    assert.strictEqual(r.decision, "HOLD", `claimed=${JSON.stringify(bad)}`);
    assert.match(r.reasons.join(" "), /is not a level/);
  }
});

test("Gate 17 — evidence that is not an object is refused, not defaulted", () => {
  for (const e of [null, "strong", 42, true]) {
    assert.strictEqual(gradeCausal(e).decision, "HOLD", JSON.stringify(e));
  }
});

test("Gate 17 — the grade says what it grades", () => {
  const r = gradeCausal({ coOccurrence: true, intervention: true, control: true, mechanism: "m" });
  assert.strictEqual(r.grades, "EVIDENCE_SHAPE", "never the truth of the claim");
});

test("Gate 17 — the result cannot be edited after the fact", () => {
  const r = gradeCausal({ coOccurrence: true });
  assert.ok(Object.isFrozen(r));
  assert.throws(() => { "use strict"; r.level = "VERIFIED"; }, TypeError);
});

// TYPE GUARD · 2026-10-10 — `=== true` silently turned the string "yes" into
// "no", and the level dropped without anyone saying why.
test("causal — a boolean answer that is not true/false HOLDS", () => {
  for (const field of ["coOccurrence", "intervention", "control"]) {
    for (const v of ["yes", "true", 1, "no"]) {
      const e = { coOccurrence: true, mechanism: "m", intervention: true, control: true };
      e[field] = v;
      const r = gradeCausal(e);
      assert.strictEqual(r.decision, "HOLD", `${field}=${JSON.stringify(v)} must hold`);
      assert.strictEqual(r.level, "UNKNOWN");
    }
  }
  const ok = gradeCausal({ coOccurrence: true, mechanism: "m", intervention: true, control: true });
  assert.strictEqual(ok.decision, "CLEAR");
  assert.strictEqual(ok.level, "VERIFIED");
});
