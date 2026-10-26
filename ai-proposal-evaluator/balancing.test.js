"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { assess } = require("./balancing.js");
const exponential = require("./fixtures/exponential-2018.json");

// A record that passes every rule, used as the baseline to perturb.
const sound = () => ({
  purpose: {
    description: "Monetise publisher sites via targeted advertising.",
    controllerObjective: "Revenue stream.",
    thirdPartyObjective: "Publisher revenue.",
  },
  necessity: {
    importantToController: "It is the company's purpose.",
    alternativeExists: false,
  },
  balancing: {
    expectedByIndividual: true,
    addsValueToIndividual: true,
    unwarrantedHarm: false,
    underminesRights: false,
    inIndividualsInterest: true,
    specialCategory: false,
    fairProcessingNotice: true,
    easyObjection: true,
  },
  safeguards: {
    controls: ["No individualised pricing.", "No sensitive categories."],
    retention: { logFiles: "60 days" },
  },
  outcome: {
    conclusion: "Legitimate interest warranted.",
    signedBy: "A. Person",
    reviewDate: "2099-01-01",
  },
});

const NOW = "2026-09-17T00:00:00.000Z";
const run = (rec) => assess(rec, { now: NOW });

test("balancing assessment for legitimate interest", async (t) => {
  await t.test("B1. a complete, sound assessment clears", () => {
    const r = run(sound());
    assert.strictEqual(r.decision, "CLEAR");
    assert.deepStrictEqual(r.reasons, []);
  });

  await t.test("B2. no identified legitimate interest is a STOP, not a gap to fill", () => {
    const rec = sound();
    delete rec.purpose.description;
    const r = run(rec);
    assert.strictEqual(r.decision, "STOP");
    assert.ok(r.reasons.some((x) => x.includes("No legitimate interest identified")));
  });

  await t.test("B3. a less intrusive alternative means the processing is not necessary", () => {
    const rec = sound();
    rec.necessity.alternativeExists = true;
    const r = run(rec);
    assert.strictEqual(r.decision, "HOLD");
    assert.ok(r.reasons.some((x) => x.includes("not necessary")));
  });

  await t.test("B4. fail-closed: an unanswered balancing question holds, never clears", () => {
    const rec = sound();
    delete rec.balancing.easyObjection;
    const r = run(rec);
    assert.notStrictEqual(r.decision, "CLEAR");
    assert.strictEqual(r.decision, "HOLD");
    assert.ok(r.reasons.some((x) => x.includes("easyObjection")));
  });

  await t.test("B5. likely unwarranted harm is a STOP", () => {
    const rec = sound();
    rec.balancing.unwarrantedHarm = true;
    const r = run(rec);
    assert.strictEqual(r.decision, "STOP");
  });

  await t.test("B6. undermining the rights of individuals is a STOP", () => {
    const rec = sound();
    rec.balancing.underminesRights = true;
    const r = run(rec);
    assert.strictEqual(r.decision, "STOP");
  });

  await t.test("B7. special category data without an Art. 9 condition is a STOP", () => {
    const rec = sound();
    rec.balancing.specialCategory = true;
    const r = run(rec);
    assert.strictEqual(r.decision, "STOP");
    assert.ok(r.reasons.some((x) => x.includes("Art. 9")));
  });

  await t.test("B8. special category data with an Art. 9 condition does not STOP on that ground", () => {
    const rec = sound();
    rec.balancing.specialCategory = true;
    rec.balancing.article9Condition = "Explicit consent under Art. 9(2)(a).";
    const r = run(rec);
    assert.strictEqual(r.decision, "CLEAR");
  });

  await t.test("B9. no notice, or no easy way to object, holds", () => {
    const noNotice = sound();
    noNotice.balancing.fairProcessingNotice = false;
    assert.strictEqual(run(noNotice).decision, "HOLD");

    const noObjection = sound();
    noObjection.balancing.easyObjection = false;
    assert.strictEqual(run(noObjection).decision, "HOLD");
  });

  await t.test("B10. missing safeguards or retention limits hold", () => {
    const noControls = sound();
    noControls.safeguards.controls = [];
    assert.strictEqual(run(noControls).decision, "HOLD");

    const noRetention = sound();
    delete noRetention.safeguards.retention;
    assert.strictEqual(run(noRetention).decision, "HOLD");
  });

  await t.test("B11. an unsigned assessment holds", () => {
    const rec = sound();
    delete rec.outcome.signedBy;
    assert.strictEqual(run(rec).decision, "HOLD");
  });

  await t.test("B12. a passed review date holds — stale is not valid (mirrors Gate 09)", () => {
    const rec = sound();
    rec.outcome.reviewDate = "2019-04-19";
    const r = run(rec);
    assert.strictEqual(r.decision, "HOLD");
    assert.ok(r.reasons.some((x) => x.includes("stale")));
  });

  await t.test("B13. an indeterminate review date cannot be shown to be in the future", () => {
    const rec = sound();
    rec.outcome.reviewDate = "19th April";
    const r = run(rec);
    assert.strictEqual(r.decision, "HOLD");
    assert.ok(r.reasons.some((x) => x.includes("not a determinate date")));
  });

  await t.test("B14. an empty record is fail-closed, not clear", () => {
    const r = run({});
    assert.strictEqual(r.decision, "STOP");
  });

  await t.test("B15. the output is deep-frozen", () => {
    const r = run(sound());
    assert.ok(Object.isFrozen(r));
    assert.ok(Object.isFrozen(r.reasons));
    assert.throws(() => {
      r.reasons.push("INJECTED");
    }, TypeError);
  });

  // The supplied document, run through the evaluator it describes.
  await t.test("B16. FIXTURE: the 2018 Exponential assessment is stale on its own terms", () => {
    const r = run(exponential);
    assert.strictEqual(r.decision, "HOLD");
    assert.ok(
      r.reasons.some((x) => x.includes("not a determinate date")),
      "expected the undated review date to be the blocker"
    );
    assert.strictEqual(r.sections["2.3 balancing"], "COMPLETE");
    assert.strictEqual(r.sections["2.5 outcome"], "INCOMPLETE");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// TYPE GUARDS · 2026-10-10
// Before this date no test covered these cases — which is why the findings
// passed without anything failing. The test is here so they do not return.
// ─────────────────────────────────────────────────────────────────────────
test("balancing — an answer that is not true/false HOLDS (does not pass, does not stop)", async (t) => {
  for (const field of ["unwarrantedHarm", "underminesRights", "specialCategory",
                      "expectedByIndividual", "easyObjection"]) {
    for (const value of ["yes", "true", "no", 1, 0]) {
      await t.test(`${field} = ${JSON.stringify(value)}`, () => {
        const rec = sound();
        rec.balancing[field] = value;
        const r = run(rec);
        assert.strictEqual(r.decision, "HOLD",
          `${field}=${JSON.stringify(value)} must HOLD, but gave ${r.decision}`);
        assert.ok(r.reasons.some((x) => x.includes("Unreadable answer")));
      });
    }
  }

  await t.test("real true/false are NOT affected", () => {
    assert.strictEqual(run(sound()).decision, "CLEAR");
    const h = sound(); h.balancing.unwarrantedHarm = true;
    assert.strictEqual(run(h).decision, "STOP");
  });

  await t.test("a blank line is not a safeguard", () => {
    const rec = sound();
    rec.safeguards.controls = ["valid control", ""];
    const r = run(rec);
    assert.strictEqual(r.decision, "HOLD");
    assert.ok(r.reasons.some((x) => x.includes("blank")));
  });
});
