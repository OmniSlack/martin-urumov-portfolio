"use strict";
// Pins the step counts the README states. Run: node --test
const { test } = require("node:test");
const assert = require("node:assert");
const g = require("./p_vs_np_gap.js");

const EXPECTED = { // n: [exhaustion steps, first-hit steps, check steps]
  8: [2304, 450, 4], 10: [11264, 847, 4], 12: [53248, 13572, 5], 14: [245760, 3915, 3],
  16: [1114112, 418914, 5], 18: [4980736, 2918723, 6], 20: [22020096, 692790, 9],
};

test("step counts are deterministic and match the recorded run", () => {
  for (const [n, [ex, hit, chk]] of Object.entries(EXPECTED)) {
    const r = g.measure(Number(n));
    assert.equal(r.exhaustionSteps, ex, `exhaustion n=${n}`);
    assert.equal(r.firstHitSteps, hit, `first hit n=${n}`);
    assert.equal(r.checkSteps, chk, `check n=${n}`);
    assert.equal(r.checkPassed, true);
    assert.equal(r.exhaustionFound, false);
  }
});

test("exhaustion costs exactly 2^n·(n+1) steps (n additions + 1 comparison per subset)", () => {
  for (let n = 4; n <= 16; n++) assert.equal(g.measure(n).exhaustionSteps, 2 ** n * (n + 1));
});

test("checking costs |certificate| + 1 steps, never more than n + 1", () => {
  for (let n = 4; n <= 20; n += 2) {
    const inst = g.makeInstance(n, 20260919);
    const r = g.check(inst.numbers, inst.target, inst.hidden);
    assert.equal(r.steps, inst.hidden.length + 1);
    assert.ok(r.steps <= n + 1);
  }
});

test("first-hit steps do not grow monotonically — that column measures luck", () => {
  assert.ok(g.measure(14).firstHitSteps < g.measure(12).firstHitSteps);
});

test("the no-answer target really has no answer (odd target, even numbers)", () => {
  const inst = g.makeInstance(12, 7);
  assert.ok(inst.numbers.every((x) => x % 2 === 0));
  assert.equal(inst.targetWithoutAnswer % 2, 1);
  assert.equal(g.find(inst.numbers, inst.targetWithoutAnswer).found, null);
});

test("a wrong certificate is rejected", () => {
  const inst = g.makeInstance(10, 20260919);
  const wrong = inst.hidden.length > 1 ? inst.hidden.slice(1) : [inst.hidden[0], 1];
  assert.equal(g.check(inst.numbers, inst.target, wrong).valid, false);
});
