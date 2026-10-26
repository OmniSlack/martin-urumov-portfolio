"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { Core } = require("./core.js");
const { Observer, verifyObservation } = require("./observer.js");

const core = new Core();
const observer = new Observer();
const goodSource = { source: "TEST", provenance: "OK" };

test("the reaction gap — observer layer", async (t) => {
  await t.test("O1. records stimulus, gap, reaction and itself", () => {
    const rec = observer.observe("something enters", () =>
      core.evaluate(goodSource, { counterModelTested: true })
    );
    assert.strictEqual(rec.layer, "OBSERVER");
    assert.strictEqual(rec.stimulus.label, "something enters");
    assert.ok(rec.gap.opened);
    assert.ok(rec.gap.closed);
    assert.ok(rec.reaction);
    assert.strictEqual(rec.self.sawReaction, true);
    assert.strictEqual(rec.self.sawItself, true);
  });

  await t.test("O2. does not correct — the reaction is the same object, by identity", () => {
    let produced;
    const rec = observer.observe("stimulus", () => {
      produced = core.evaluate(goodSource, { counterModelTested: true });
      return produced;
    });
    assert.strictEqual(rec.reaction, produced);
    assert.strictEqual(rec.self.corrected, false);
  });

  await t.test("O3. does not correct — observing does not change the decision", () => {
    const ctx = { counterModelTested: false };
    const bare = core.evaluate(goodSource, ctx);
    const observed = observer.observe("s", () => core.evaluate(goodSource, ctx));
    assert.strictEqual(observed.reaction.decision, bare.decision);
    assert.deepStrictEqual(observed.reaction.reasons, bare.reasons);
  });

  await t.test("O4. synchronises — the gap brackets the reaction's own timestamp", () => {
    const rec = observer.observe("s", () => core.evaluate(goodSource, { counterModelTested: true }));
    assert.strictEqual(rec.gap.synchronised, true);
    assert.ok(rec.reaction.timestamp >= rec.gap.opened);
    assert.ok(rec.reaction.timestamp <= rec.gap.closed);
  });

  await t.test("O5. STOP passes through the observer unchanged", () => {
    const rec = observer.observe("external action", () =>
      core.evaluate(goodSource, { counterModelTested: true, triggerExternalAction: true })
    );
    assert.strictEqual(rec.reaction.decision, "STOP");
    assert.strictEqual(rec.self.corrected, false);
  });

  await t.test("O6. the record is deep-frozen and cannot be rewritten", () => {
    const rec = observer.observe("s", () => core.evaluate(goodSource, { counterModelTested: true }));
    assert.ok(Object.isFrozen(rec));
    assert.ok(Object.isFrozen(rec.self));
    assert.throws(() => {
      rec.self.corrected = true;
    }, TypeError);
    assert.throws(() => {
      rec.reaction.decision = "CLEAR";
    }, TypeError);
  });

  await t.test("O7. gatesFired counts the reasons the reaction actually carries", () => {
    const rec = observer.observe("s", () =>
      core.evaluate({ source: "UNKNOWN", provenance: null }, { counterModelTested: false })
    );
    assert.strictEqual(rec.gap.gatesFired, rec.reaction.reasons.length);
    assert.ok(rec.gap.gatesFired >= 2);
  });

  await t.test("O8. observing requires a reaction to observe", () => {
    assert.throws(() => observer.observe("s", null), TypeError);
  });

  await t.test("O9. observing never claims or releases the action lock", () => {
    const c = new Core();
    const before = c.actionInFlight;
    observer.observe("s", () => c.evaluate(goodSource, { counterModelTested: true }));
    assert.strictEqual(c.actionInFlight, before);
    assert.strictEqual(c.actionInFlight, null);

    // And the same while an action is genuinely in flight.
    const act = { ...goodSource, requiresTransition: true, targetSignature: "SIG123" };
    const cleared = c.evaluate(act, {
      counterModelTested: true, humanPermit: "PRESENT", permitSignature: "SIG123",
    });
    const lock = c.begin(cleared, act);
    assert.ok(lock);
    const during = c.actionInFlight;
    observer.observe("s", () => c.evaluate(goodSource, { counterModelTested: true }));
    assert.strictEqual(c.actionInFlight, during);
  });

  // --- v0.8: self is measured, not declared -------------------------------
  //
  // Until now these three were literals. Each test below fails if the
  // corresponding property stops holding — which is the whole point: a field
  // that cannot fail is not a measurement.

  await t.test("O10. sawReaction is false when nothing was returned", () => {
    const rec = observer.observe("s", () => undefined);
    assert.strictEqual(rec.self.sawReaction, false, "must not claim to have seen nothing");
    assert.strictEqual(rec.self.reactionDigest, null);
    assert.strictEqual(rec.gap.synchronised, false);
    assert.strictEqual(rec.gap.gatesFired, 0);
  });

  await t.test("O11. sawReaction is false when what came back is not a reaction", () => {
    for (const notAReaction of [42, "CLEAR", null, {}, { decision: "PROBABLY_FINE" }]) {
      const rec = observer.observe("s", () => notAReaction);
      assert.strictEqual(rec.self.sawReaction, false, `${JSON.stringify(notAReaction)} is not a reaction`);
    }
  });

  await t.test("O12. does not correct — an unfrozen reaction is left unfrozen", () => {
    // The defect this catches: deep-freezing the whole record froze the
    // observed object too. Making someone else's object immutable is still
    // changing it.
    const mutable = { decision: "CLEAR", reasons: [], timestamp: new Date().toISOString() };
    const rec = observer.observe("s", () => mutable);
    assert.ok(!Object.isFrozen(mutable), "the Observer must not freeze what it observes");
    assert.ok(Object.isExtensible(mutable));
    assert.strictEqual(rec.reaction, mutable);
    assert.ok(Object.isFrozen(rec.self), "but it does freeze its own record");
  });

  await t.test("O13. verifyObservation confirms a genuine record", () => {
    const rec = observer.observe("s", () => core.evaluate(goodSource, { counterModelTested: true }));
    assert.deepStrictEqual(verifyObservation(rec), { valid: true, reason: null });
    assert.strictEqual(rec.self.sawItself, true);
    assert.match(rec.self.seal, /^[0-9a-f]{64}$/);
  });

  await t.test("O14. a swapped reaction is detected, and named", () => {
    const rec = observer.observe("s", () => core.evaluate(goodSource, { counterModelTested: true }));
    const forged = { ...rec, reaction: { decision: "CLEAR", reasons: [], timestamp: rec.gap.opened } };
    const v = verifyObservation(forged);
    assert.strictEqual(v.valid, false);
    assert.strictEqual(v.reason, "REACTION_CHANGED_SINCE_OBSERVED");
  });

  await t.test("O15. an altered gap is detected, and named", () => {
    const rec = observer.observe("s", () => core.evaluate(goodSource, { counterModelTested: true }));
    const forged = { ...rec, gap: { ...rec.gap, closed: "2099-01-01T00:00:00.000Z" } };
    const v = verifyObservation(forged);
    assert.strictEqual(v.valid, false);
    assert.strictEqual(v.reason, "RECORD_ALTERED_AFTER_SEALING");
  });

  await t.test("O16. the Observer counts its own observations", () => {
    const o = new Observer();
    assert.strictEqual(o.observations, 0);
    const a = o.observe("s", () => core.evaluate(goodSource, { counterModelTested: true }));
    const b = o.observe("s", () => core.evaluate(goodSource, { counterModelTested: true }));
    assert.strictEqual(a.self.observation, 1);
    assert.strictEqual(b.self.observation, 2);
    assert.notStrictEqual(a.self.seal, b.self.seal, "two acts are not one act");
  });

  await t.test("O18. corrected:false does not conflate two different facts", () => {
    // Raised by an outside reader of the v0.8 record: `corrected: false` said
    // both "checked, and it was unchanged" and "there was nothing to check".
    // One field carrying two meanings is the defect this file exists to avoid.
    const seen = observer.observe("s", () =>
      core.evaluate(goodSource, { counterModelTested: true }));
    const nothing = observer.observe("s", () => undefined);

    assert.strictEqual(seen.self.correctionChecked, true, "a reaction arrived, so the check ran");
    assert.strictEqual(seen.self.corrected, false, "and it was unchanged");

    assert.strictEqual(nothing.self.correctionChecked, false, "nothing arrived, so nothing was checked");
    assert.strictEqual(nothing.self.corrected, false, "which is not the same as 'unchanged'");

    // The two records must now be distinguishable from self alone, without
    // having to read another field and infer.
    assert.notStrictEqual(seen.self.correctionChecked, nothing.self.correctionChecked);
  });

  await t.test("O19. a forged check flag is caught by verification", () => {
    const rec = observer.observe("s", () => undefined);
    const forged = { ...rec, self: { ...rec.self, correctionChecked: true } };
    const v = verifyObservation(forged);
    assert.strictEqual(v.valid, false);
    assert.strictEqual(v.reason, "CHECK_FLAG_DOES_NOT_MATCH_WHAT_WAS_SEEN");
  });

  await t.test("O17. corrected is derived from the object, not asserted", () => {
    let produced;
    const rec = observer.observe("s", () => {
      produced = core.evaluate(goodSource, { counterModelTested: true });
      return produced;
    });
    assert.strictEqual(rec.self.corrected, false);
    assert.strictEqual(rec.reaction, produced, "same object, by identity");
    assert.strictEqual(rec.self.reactionDigest, verifyObservation(rec).valid
      ? rec.self.reactionDigest : null);
    // An unobserved reaction carries no digest, so it cannot claim one.
    const empty = observer.observe("s", () => undefined);
    assert.strictEqual(empty.self.corrected, false);
    assert.strictEqual(verifyObservation(empty).valid, true);
  });
});
