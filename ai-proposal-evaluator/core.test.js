"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { Core } = require("./core.js");

const core = new Core();
const goodSource = { source: "TEST", provenance: "OK" };

test("core reasoning suite", async (t) => {
  await t.test("1. evaluates without opening the action boundary", () => {
    const r = core.evaluate(goodSource, { counterModelTested: true });
    assert.strictEqual(r.actionBoundary, "CLOSED");
    assert.strictEqual(r.decision, "CLEAR");
  });

  await t.test("2. unknown source and observation remain unknown", () => {
    const r = core.evaluate({ source: "UNKNOWN", provenance: null }, { counterModelTested: true });
    assert.strictEqual(r.provenance.source, "UNKNOWN");
    assert.strictEqual(r.provenance.status, "UNVERIFIED");
  });

  await t.test("3. missing counter-model evidence causes HOLD", () => {
    const r = core.evaluate(goodSource, { counterModelTested: false });
    assert.strictEqual(r.decision, "HOLD");
    assert.ok(r.reasons.some((x) => x.includes("counter-model")));
  });

  await t.test("4. external action requests are stopped and never executed", () => {
    const r = core.evaluate(goodSource, { counterModelTested: true, triggerExternalAction: true });
    assert.strictEqual(r.decision, "STOP");
    assert.ok(r.reasons.some((x) => x.includes("External execution requested")));
  });

  await t.test("5. protected state transition requires exact human confirmation", () => {
    const p = { ...goodSource, requiresTransition: true, targetSignature: "SIG123" };
    const r = core.evaluate(p, { counterModelTested: true });
    assert.strictEqual(r.decision, "HOLD");
    assert.ok(r.reasons.some((x) => x.includes("requires present human permit")));
  });

  await t.test("6. exact human confirmation permits only the matching transition", () => {
    const p = { ...goodSource, requiresTransition: true, targetSignature: "SIG123" };
    const r = core.evaluate(p, { counterModelTested: true, humanPermit: "PRESENT", permitSignature: "SIG123" });
    assert.strictEqual(r.decision, "CLEAR");
  });

  await t.test("7. wrong-scope confirmation does not authorize", () => {
    const p = { ...goodSource, requiresTransition: true, targetSignature: "SIG123" };
    const r = core.evaluate(p, { counterModelTested: true, humanPermit: "PRESENT", permitSignature: "WRONG_SIG" });
    assert.strictEqual(r.decision, "HOLD");
    assert.ok(r.reasons.some((x) => x.includes("signature/scope mismatch")));
  });

  await t.test("8. temporal conflict preserves state and blocks authority", () => {
    const p = { ...goodSource, requiresTransition: true, targetSignature: "SIG123" };
    const r = core.evaluate(p, {
      counterModelTested: true, humanPermit: "PRESENT", permitSignature: "SIG123", permitExpired: true,
    });
    assert.strictEqual(r.decision, "HOLD");
    assert.ok(r.reasons.some((x) => x.includes("Temporal conflict detected")));
  });

  await t.test("9. output is immutable working state", () => {
    const r = core.evaluate(goodSource, { counterModelTested: true });
    assert.ok(Object.isFrozen(r));
    assert.throws(() => { r.decision = "MUTATED"; }, TypeError);
  });

  await t.test("10. STOP is absolute and cannot be demoted to HOLD", () => {
    const r = core.evaluate(goodSource, { counterModelTested: false, triggerExternalAction: true });
    assert.strictEqual(r.decision, "STOP");
  });

  // --- v0.3 regression tests ---

  await t.test("11. REGRESSION D1: unknown source does not return CLEAR", () => {
    const r = core.evaluate({ source: "UNKNOWN", provenance: null }, { counterModelTested: true });
    assert.notStrictEqual(r.decision, "CLEAR");
    assert.strictEqual(r.decision, "HOLD");
    assert.ok(r.reasons.some((x) => x.includes("fail-closed")));
  });

  await t.test("12. REGRESSION D1: a proposal with no source at all is fail-closed", () => {
    const r = core.evaluate({}, { counterModelTested: true });
    assert.strictEqual(r.decision, "HOLD");
    assert.strictEqual(r.provenance.status, "UNVERIFIED");
  });

  await t.test("13. REGRESSION D2: Gate 08 blocks PRODUCTION_RUN without approval", () => {
    const r = core.evaluate({ ...goodSource, mode: "PRODUCTION_RUN" }, { counterModelTested: true });
    assert.strictEqual(r.decision, "HOLD");
    assert.ok(r.reasons.some((x) => x.includes("Gate 08")));
  });

  await t.test("14. REGRESSION D2: Gate 08 allows PRODUCTION_RUN once approved", () => {
    const r = core.evaluate({ ...goodSource, mode: "PRODUCTION_RUN" }, { counterModelTested: true, productionApproved: true });
    assert.strictEqual(r.decision, "CLEAR");
  });

  await t.test("15. reasons array is frozen and cannot be appended to", () => {
    const r = core.evaluate({ source: "UNKNOWN", provenance: null }, { counterModelTested: false });
    assert.ok(Object.isFrozen(r.reasons));
    assert.throws(() => { r.reasons.push("INJECTED"); }, TypeError);
  });

  await t.test("16. an unverified source combined with external action still yields STOP", () => {
    const r = core.evaluate({ source: "UNKNOWN", provenance: null }, { counterModelTested: false, triggerExternalAction: true });
    assert.strictEqual(r.decision, "STOP");
  });

  // --- v0.4: Gate 13, lawful basis for personal-data processing ---

  await t.test("17. Gate 13 holds personal-data processing with no balancing assessment", () => {
    const r = core.evaluate({ ...goodSource, processesPersonalData: true }, { counterModelTested: true });
    assert.strictEqual(r.decision, "HOLD");
    assert.ok(r.reasons.some((x) => x.includes("Gate 13")));
  });

  await t.test("18. Gate 13 propagates a STOP from the balancing assessment", () => {
    const r = core.evaluate(
      { ...goodSource, processesPersonalData: true },
      { counterModelTested: true, balancingOutcome: { decision: "STOP" } }
    );
    assert.strictEqual(r.decision, "STOP");
  });

  await t.test("19. Gate 13 propagates a HOLD from the balancing assessment", () => {
    const r = core.evaluate(
      { ...goodSource, processesPersonalData: true },
      { counterModelTested: true, balancingOutcome: { decision: "HOLD" } }
    );
    assert.strictEqual(r.decision, "HOLD");
  });

  await t.test("20. Gate 13 does not block once the balancing assessment is CLEAR", () => {
    const r = core.evaluate(
      { ...goodSource, processesPersonalData: true },
      { counterModelTested: true, balancingOutcome: { decision: "CLEAR" } }
    );
    assert.strictEqual(r.decision, "CLEAR");
  });

  await t.test("21. Gate 13 fails closed on an unrecognised balancing outcome", () => {
    const r = core.evaluate(
      { ...goodSource, processesPersonalData: true },
      { counterModelTested: true, balancingOutcome: { decision: "PROBABLY_FINE" } }
    );
    assert.strictEqual(r.decision, "HOLD");
  });

  await t.test("22. proposals that do not touch personal data are unaffected by Gate 13", () => {
    const r = core.evaluate(goodSource, { counterModelTested: true });
    assert.strictEqual(r.decision, "CLEAR");
    assert.ok(!r.reasons.some((x) => x.includes("Gate 13")));
  });
});

// --- v0.5: Gate 14 — observation is unbounded, action is one at a time ---

test("Gate 14 — one action in flight", async (t) => {
  const action = () => ({
    ...goodSource,
    requiresTransition: true,
    targetSignature: "SIG123",
  });
  const permit = {
    counterModelTested: true,
    humanPermit: "PRESENT",
    permitSignature: "SIG123",
  };

  await t.test("G1. a second action while one is in flight is HELD, not CLEARED", () => {
    const c = new Core();
    const firstProposal = action();
    const first = c.evaluate(firstProposal, permit);
    assert.strictEqual(first.decision, "CLEAR");
    assert.ok(c.begin(first, firstProposal));

    const second = c.evaluate(action(), permit);
    assert.notStrictEqual(second.decision, "CLEAR");
    assert.strictEqual(second.decision, "HOLD");
    assert.ok(second.reasons.some((x) => x.includes("Gate 14")));
  });

  await t.test("G2. once released, the next action may proceed", () => {
    const c = new Core();
    const firstProposal = action();
    const first = c.evaluate(firstProposal, permit);
    const key = c.begin(first, firstProposal);
    assert.strictEqual(c.release(key), true);

    const second = c.evaluate(action(), permit);
    assert.strictEqual(second.decision, "CLEAR");
  });

  await t.test("G3. release with the wrong key does not free the lock", () => {
    const c = new Core();
    const key = c.begin(c.evaluate(action(), permit), action());
    assert.ok(key);
    assert.strictEqual(c.release("NOT-THE-KEY"), false);
    assert.notStrictEqual(c.actionInFlight, null);
    assert.strictEqual(c.evaluate(action(), permit).decision, "HOLD");
  });

  await t.test("G4. the lock cannot be claimed twice, nor by a non-CLEAR assessment", () => {
    const c = new Core();
    assert.ok(c.begin(c.evaluate(action(), permit), action()));
    assert.strictEqual(c.begin(c.evaluate(action(), permit), action()), null);

    const d = new Core();
    const heldProposal = action();
    const held = d.evaluate(heldProposal, { counterModelTested: true }); // no permit
    assert.strictEqual(held.decision, "HOLD");
    assert.strictEqual(d.begin(held, heldProposal), null);
    assert.strictEqual(d.actionInFlight, null);
  });

  await t.test("G5. observation stays unbounded while an action is in flight", () => {
    const c = new Core();
    c.begin(c.evaluate(action(), permit), action());
    const lockDuring = c.actionInFlight;

    for (let i = 0; i < 10; i++) {
      const look = c.evaluate(goodSource, { counterModelTested: true });
      assert.strictEqual(look.decision, "CLEAR");
      assert.ok(!look.reasons.some((x) => x.includes("Gate 14")));
    }

    // Ten evaluations did not take, release, or alter the lock.
    assert.strictEqual(c.actionInFlight, lockDuring);
  });

  await t.test("G6. the constraint is on acting, not on attending", () => {
    const c = new Core();
    c.begin(c.evaluate(action(), permit), action());
    // A PRODUCTION_RUN would act, so it is held...
    const acting = c.evaluate({ ...goodSource, mode: "PRODUCTION_RUN" }, { counterModelTested: true, productionApproved: true });
    assert.strictEqual(acting.decision, "HOLD");
    assert.ok(acting.reasons.some((x) => x.includes("Gate 14")));
    // ...while a plain evaluation of the same source is not.
    assert.strictEqual(c.evaluate(goodSource, { counterModelTested: true }).decision, "CLEAR");
  });
});

// --- Gate 15: evidence independence ---------------------------------------

test("Gate 15 — asserting confidence without an independence assessment holds", () => {
  const core = new Core();
  const r = core.evaluate(
    { source: "S", provenance: "P", assertsConfidence: true },
    { counterModelTested: true }
  );
  assert.strictEqual(r.decision, "HOLD");
  assert.match(r.reasons.join(" "), /Gate 15 Block: Confidence asserted without/);
});

test("Gate 15 — a HOLD from the independence assessment is not silently dropped", () => {
  const core = new Core();
  const r = core.evaluate(
    { source: "S", provenance: "P", assertsConfidence: true },
    { counterModelTested: true, independenceOutcome: { decision: "HOLD" } }
  );
  assert.strictEqual(r.decision, "HOLD");
  assert.match(r.reasons.join(" "), /Independence assessment returned HOLD/);
});

test("Gate 15 — an unrecognised independence outcome fails closed, not open", () => {
  const core = new Core();
  const r = core.evaluate(
    { source: "S", provenance: "P", assertsConfidence: true },
    { counterModelTested: true, independenceOutcome: { decision: "PROBABLY_FINE" } }
  );
  assert.strictEqual(r.decision, "HOLD", "an unknown value must not pass as CLEAR");
});

test("Gate 15 — a CLEAR independence assessment lets the proposal through", () => {
  const core = new Core();
  const r = core.evaluate(
    { source: "S", provenance: "P", assertsConfidence: true },
    { counterModelTested: true, independenceOutcome: { decision: "CLEAR" } }
  );
  assert.strictEqual(r.decision, "CLEAR");
});

test("Gate 15 — a proposal that asserts nothing is not asked for an assessment", () => {
  const core = new Core();
  const r = core.evaluate({ source: "S", provenance: "P" }, { counterModelTested: true });
  assert.strictEqual(r.decision, "CLEAR");
  assert.ok(!r.reasons.some((x) => x.startsWith("Gate 15")));
});

test("Gate 15 — the real arithmetic, end to end", () => {
  const { assessIndependence } = require("./independence.js");
  const core = new Core();

  // One source restated twice, with the inflated number already claimed.
  const outcome = assessIndependence(
    [
      { id: "A", source: "one-report", confidence: 0.75 },
      { id: "B", source: "one-report", confidence: 0.75, derivedFrom: "A" },
      { id: "C", source: "one-report", confidence: 0.75, derivedFrom: "A" },
    ],
    27 / 28
  );
  const r = core.evaluate(
    { source: "S", provenance: "P", assertsConfidence: true },
    { counterModelTested: true, independenceOutcome: outcome }
  );
  assert.strictEqual(r.decision, "HOLD");
  assert.ok(outcome.inflationPoints > 21.4 && outcome.inflationPoints < 21.5);
});

// --- Gate 18: confidence needs evidence -----------------------------------

test("Gate 18 — a bare confidence number is held", () => {
  const core = new Core();
  const r = core.evaluate(
    { source: "S", provenance: "P", confidence: 0.9 },
    { counterModelTested: true }
  );
  assert.strictEqual(r.decision, "HOLD");
  assert.match(r.reasons.join(" "), /confidence asserted without evidence/);
});

test("Gate 18 — empty evidence is not support", () => {
  const core = new Core();
  const r = core.evaluate(
    { source: "S", provenance: "P", confidence: 0.9, evidence: [] },
    { counterModelTested: true }
  );
  assert.strictEqual(r.decision, "HOLD");
  assert.match(r.reasons.join(" "), /Absence is not support/);
});

// ⚠️ VALUE CHANGED, 2026-10-12. This was `confidence: 0.9` and the test
// asserted that it passes CLEAN. The owner's instruction of the same day:
// "high confidence is a flag, not a seal… the very need to say a hundred
// percent is the sign that checking has stopped." So this test pinned
// exactly the behaviour the rule declares wrong.
//
// Its intent stays — confidence WITH evidence is not refused — but it is
// checked with a value that is not high. High confidence has its own test
// below.
test("Gate 18 — confidence with evidence passes", () => {
  const core = new Core();
  const r = core.evaluate(
    { source: "S", provenance: "P", confidence: 0.6, evidence: [{ id: "A" }] },
    { counterModelTested: true }
  );
  assert.strictEqual(r.decision, "CLEAR");
});

test("Gate 21 — high confidence is a flag, not a seal", () => {
  const core = new Core();
  const r = core.evaluate(
    { source: "S", provenance: "P", confidence: 0.95, evidence: [{ id: "A" }] },
    { counterModelTested: true }
  );
  assert.strictEqual(r.decision, "HOLD");
  assert.match(r.reasons.join(" "), /flag, not a seal/);
  assert.match(r.reasons.join(" "), /never closes the question/);
});

test("Gate 21 — 0.9, exactly at the edge, also triggers the extra look", () => {
  const core = new Core();
  const r = core.evaluate(
    { source: "S", provenance: "P", confidence: 0.9, evidence: [{ id: "A" }] },
    { counterModelTested: true }
  );
  assert.strictEqual(r.decision, "HOLD");
});

test("Gate 21 — moderate confidence is NOT flagged", () => {
  // The narrowing in the other direction: the rule is about HIGH confidence.
  // If it flagged every value, the gate would mean "assert nothing" and would
  // be switched off — a check that always fails gets bypassed.
  for (const c of [0.1, 0.5, 0.89]) {
    const core = new Core();
    const r = core.evaluate(
      { source: "S", provenance: "P", confidence: c, evidence: [{ id: "A" }] },
      { counterModelTested: true }
    );
    assert.strictEqual(r.decision, "CLEAR", `confidence ${c} must not be flagged`);
  }
});

// ── Gate 22 · THE GAP ─────────────────────────────────────────────────────
test("Gate 22 — a zero gap is a flag", () => {
  // Frozen clock: it always returns the same value, so the gap is 0.
  // Without an injected clock this case is unreachable on a real machine —
  // so the gate could never fail, and a check that cannot fail is decoration.
  const core = new Core({ clock: () => 7n });
  const r = core.evaluate(
    { source: "S", provenance: "P" },
    { counterModelTested: true }
  );
  assert.strictEqual(r.decision, "HOLD");
  assert.match(r.reasons.join(" "), /zero gap/);
  assert.strictEqual(r.reactionGapNs, "0");
});

test("Gate 22 — the real clock gives a non-zero gap", () => {
  const core = new Core();
  const r = core.evaluate(
    { source: "S", provenance: "P" },
    { counterModelTested: true }
  );
  assert.ok(BigInt(r.reactionGapNs) > 0n, "the gap must be > 0");
  assert.strictEqual(r.decision, "CLEAR");
});

test("Gate 22 — the gap is RECORDED in every verdict, not only when flagged", () => {
  // A recorded gap can be checked; an unrecorded one is a promise. A verdict
  // without it cannot be judged from outside.
  const core = new Core();
  const r = core.evaluate({ source: "S" }, { counterModelTested: true });
  assert.ok(Object.prototype.hasOwnProperty.call(r, "reactionGapNs"));
  assert.strictEqual(typeof r.reactionGapNs, "string", "BigInt does not go into JSON");
});

// ── U-24 · GAP MARKERS ────────────────────────────────────────────────
test("Gate 22 — the gap names what is being checked, not only that something is", () => {
  const core = new Core();
  const r = core.evaluate({ source: "S" }, { counterModelTested: true });
  assert.ok(Array.isArray(r.reactionGapMarkers));
  assert.ok(r.reactionGapMarkers.length >= 2, "at least opening and closing");
  for (const m of r.reactionGapMarkers) {
    assert.strictEqual(typeof m.step, "string");
    assert.ok(m.step.length > 3, "a marker without content is silent in another way");
    assert.strictEqual(typeof m.atNs, "string", "BigInt does not go into JSON");
  }
});

test("Gate 22 — markers move forward, not backward", () => {
  // A marker pointing earlier than the previous one means time was measured
  // from a different point — then "where the time went" is a wrong answer.
  const core = new Core();
  const r = core.evaluate({ source: "S" }, { counterModelTested: true });
  const t = r.reactionGapMarkers.map((m) => BigInt(m.atNs));
  for (let i = 1; i < t.length; i++) {
    assert.ok(t[i] >= t[i - 1], `marker ${i} points backward relative to ${i - 1}`);
  }
});

test("Gate 22 — a SILENT gap is a separate flag from a zero gap", () => {
  // The two failures differ: zero means "nothing happened", silent means
  // "something happened that was not named". Merged under one flag, the
  // second disappears behind the first.
  //
  // A silent gap is reachable only with a disassembled Core; this test checks
  // the other side: a real run is NOT silent.
  const core = new Core();
  const r = core.evaluate({ source: "S" }, { counterModelTested: true });
  assert.ok(!r.reasons.join(" ").includes("silent gap"),
    "a real run is NOT silent");
  assert.ok(r.reactionGapMarkers.length > 0);
});

test("Gate 22 — a clock running backward is also a flag", () => {
  // A negative gap is not "small" — it means the measure is unusable.
  let t = 100n;
  const core = new Core({ clock: () => (t -= 10n) });
  const r = core.evaluate({ source: "S" }, { counterModelTested: true });
  assert.strictEqual(r.decision, "HOLD");
  assert.match(r.reasons.join(" "), /zero gap/);
});

test("Gate 18 — confidence outside (0,1) is refused, not clamped", () => {
  const core = new Core();
  for (const c of [0, 1, -0.5, 1.5, NaN, Infinity, "0.9"]) {
    const r = core.evaluate(
      { source: "S", provenance: "P", confidence: c, evidence: [{ id: "A" }] },
      { counterModelTested: true }
    );
    assert.strictEqual(r.decision, "HOLD", `confidence ${c} must not pass`);
  }
});

test("Gate 18 — a proposal that asserts nothing is not asked for evidence", () => {
  const core = new Core();
  const r = core.evaluate({ source: "S", provenance: "P" }, { counterModelTested: true });
  assert.strictEqual(r.decision, "CLEAR");
  assert.ok(!r.reasons.some((x) => x.startsWith("Gate 18")));
});

// --- proposed vs executed --------------------------------------------------

test("proposed ≠ executed — releasing without complete() records not done", () => {
  const c = new Core();
  const clearedProposal = { source: "S", provenance: "P" };
  const cleared = c.evaluate(clearedProposal, { counterModelTested: true });
  const key = c.begin(cleared, clearedProposal);
  assert.ok(key);
  assert.strictEqual(c.actionInFlight.executed, null, "claiming the lock is a proposal");

  assert.strictEqual(c.release(key), true);
  assert.strictEqual(c.lastAction.executed, null, "proposed, and not done");
  assert.strictEqual(c.lastAction.durationMs, null);
  assert.ok(c.lastAction.proposed, "but the proposal itself is recorded");
});

test("proposed ≠ executed — complete() is what marks it done", () => {
  const c = new Core();
  const proposal = { source: "S", provenance: "P" };
  const key = c.begin(c.evaluate(proposal, { counterModelTested: true }), proposal);
  const done = c.complete(key, "written");
  assert.ok(done.executed, "complete() timestamps the execution");
  assert.strictEqual(done.outcome, "written");

  c.release(key);
  assert.ok(c.lastAction.executed);
  assert.strictEqual(c.lastAction.outcome, "written");
  assert.ok(c.lastAction.durationMs >= 0);
});

test("proposed ≠ executed — a foreign key cannot mark someone else's action done", () => {
  const c = new Core();
  const proposal = { source: "S", provenance: "P" };
  const key = c.begin(c.evaluate(proposal, { counterModelTested: true }), proposal);
  assert.strictEqual(c.complete("ACT-FORGED-000"), null);
  assert.strictEqual(c.actionInFlight.executed, null, "state unchanged");
  assert.ok(c.complete(key), "the real key still works");
});

test("proposed ≠ executed — completing twice is refused", () => {
  const c = new Core();
  const proposal = { source: "S", provenance: "P" };
  const key = c.begin(c.evaluate(proposal, { counterModelTested: true }), proposal);
  assert.ok(c.complete(key, "first"));
  assert.strictEqual(c.complete(key, "second"), null, "once, not twice");
  c.release(key);
  assert.strictEqual(c.lastAction.outcome, "first");
});

test("proposed ≠ executed — complete() with no action in flight returns null", () => {
  assert.strictEqual(new Core().complete("any"), null);
});

// ── THE THREE LAYERS · carried from omniecho-core f36373e (2026-10-26) ──────
//
// Source of the rules: the owner's own Python code of 2026-09-15/16
// (`execution_ticket`, `kompas_core`, `sidecar_validator_v3`). Measured on
// the previous core.js, before the change:
//   1 · the same verdict, second begin()            → ACCEPTED
//   2 · protected action with no permit             → CLEAR, zero reasons
//   3 · "verified" with no verifier, or by the Core → accepted
const clean = { source: "TEST", provenance: "OK" };
const ctx = { counterModelTested: true };

// Layer 1 — a verdict is a single-use ticket
test("ticket · one verdict is spent ONCE", () => {
  const c = new Core();
  const v = c.evaluate(clean, ctx);
  const k1 = c.begin(v, clean);
  assert.ok(k1, "first begin() passes");
  c.complete(k1);
  c.release(k1);
  assert.strictEqual(c.begin(v, clean), null, "the same verdict a second time is refused");
});

test("ticket · spending does not depend on finishing", () => {
  const c = new Core();
  const v = c.evaluate(clean, ctx);
  c.begin(v, clean);
  c.release(c.actionInFlight && c.actionInFlight.key);
  assert.strictEqual(c.begin(v, clean), null, "an abandoned ticket is spent too");
});

test("ticket · a new verdict for the same proposal still passes", () => {
  const c = new Core();
  const v1 = c.evaluate(clean, ctx);
  const k1 = c.begin(v1, clean);
  c.complete(k1); c.release(k1);
  const v2 = c.evaluate(clean, ctx);
  assert.ok(c.begin(v2, clean), "a second VERDICT gives a second ticket — not a ban on work");
});

// Layer 2 — a protected action needs both
const prot = { ...clean, action: "demote-canon", target: "CANON", scope: "project" };

test("both required · protected action with no permit does NOT pass", () => {
  const c = new Core({ protectedActions: ["demote-canon"] });
  const r = c.evaluate(prot, ctx);
  assert.strictEqual(r.decision, "HOLD", "a clean verdict alone does not release a protected action");
  assert.ok(r.reasons.some((s) => /there is no permit/.test(s)), JSON.stringify(r.reasons));
});

test("both required · a permit for something ELSE does not work", () => {
  const c = new Core({ protectedActions: ["demote-canon"] });
  const permit = { target: "OTHER", action: "demote-canon", scope: "project", grantedBy: "Martin" };
  const r = c.evaluate(prot, { ...ctx, actionPermit: permit });
  assert.strictEqual(r.decision, "HOLD");
  assert.ok(r.reasons.some((s) => /does not match/.test(s)), JSON.stringify(r.reasons));
});

test("both required · exact permit + clean verdict passes", () => {
  const c = new Core({ protectedActions: ["demote-canon"] });
  const permit = { target: "CANON", action: "demote-canon", scope: "project", grantedBy: "Martin" };
  const r = c.evaluate(prot, { ...ctx, actionPermit: permit });
  assert.strictEqual(r.decision, "CLEAR", JSON.stringify(r.reasons));
});

test("both required · an unprotected action needs no permit", () => {
  const c = new Core({ protectedActions: ["demote-canon"] });
  const r = c.evaluate({ ...clean, action: "read" }, ctx);
  assert.strictEqual(r.decision, "CLEAR", JSON.stringify(r.reasons));
});

test("both required · a genuine permit cannot rescue a bad verdict", () => {
  const c = new Core({ protectedActions: ["demote-canon"] });
  const permit = { target: "CANON", action: "demote-canon", scope: "project", grantedBy: "Martin" };
  const r = c.evaluate(
    { source: "UNKNOWN", provenance: null, action: "demote-canon", target: "CANON", scope: "project" },
    { ...ctx, actionPermit: permit });
  assert.strictEqual(r.decision, "HOLD", "the permit does not rescue an unclean verdict");
});

// Layer 3 — "verified" needs someone else
test("independent · VERIFIED with no named verifier is refused", () => {
  const c = new Core();
  const k = c.begin(c.evaluate(clean, ctx), clean);
  assert.strictEqual(c.complete(k, "VERIFIED"), null);
});

test("independent · the verifier cannot be the Core itself", () => {
  const c = new Core();
  const k = c.begin(c.evaluate(clean, ctx), clean);
  assert.strictEqual(c.complete(k, "VERIFIED", { verifiedBy: "CORE" }), null);
});

test("independent · a named outside verifier closes and is recorded", () => {
  const c = new Core();
  const k = c.begin(c.evaluate(clean, ctx), clean);
  const d = c.complete(k, "VERIFIED", { verifiedBy: "Martin" });
  assert.ok(d);
  assert.strictEqual(d.verifiedBy, "Martin", "the name is RECORDED, not only accepted");
});

test("independent · a plain completion is unchanged", () => {
  const c = new Core();
  const k = c.begin(c.evaluate(clean, ctx), clean);
  assert.ok(c.complete(k, "written"), "a completion with no verification claim needs no one");
});
