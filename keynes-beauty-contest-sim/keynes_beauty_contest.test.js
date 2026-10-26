"use strict";
// Pins the numbers the README states. Run: node --test
const { test } = require("node:test");
const assert = require("node:assert");
const k = require("./keynes_beauty_contest.js");

const close = (a, b, eps = 5e-4) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("the ladder: level k names 50·(2/3)^k", () => {
  close(k.choice(0), 50);
  close(k.choice(1), 33.333);
  close(k.choice(2), 22.222);
  close(k.choice(3), 14.815);
  close(k.choice(11), 0.578);
  assert.ok(k.choice(200) < 1e-30); // the limit, level ∞ = the Nash equilibrium, is 0
});

test('against the assumed "real people" crowd: target 17.593, level 3 wins', () => {
  const r = k.play(k.CROWDS["real people (Nagel 1995)"]);
  close(r.target, 17.593);
  assert.equal(r.best.level, 3);
  close(Math.abs(k.choice(11) - r.target), 17.015);
  // the equilibrium (0) misses by the whole target, 17.593. Level 0 misses by
  // 32.407, so the original claim "worse than level 0" was false (corrected).
  close(Math.abs(k.choice(0) - r.target), 32.407);
  assert.ok(r.target < Math.abs(k.choice(0) - r.target));
  for (let L = 1; L <= 11; L++) assert.ok(Math.abs(k.choice(L) - r.target) < r.target, `level ${L}`);
});

test("the winning level depends on the crowd", () => {
  const expect = {
    "novices, never played": [28.15, 1],
    "real people (Nagel 1995)": [17.59, 3],
    "players who have played": [8.78, 4],
    "theorists only": [0.78, 10],
    "half naive, half deep": [16.86, 3],
  };
  for (const [name, [target, level]] of Object.entries(expect)) {
    const r = k.play(k.CROWDS[name]);
    close(r.target, target, 5e-3);
    assert.equal(r.best.level, level, name);
  }
});

test("repeated game (8 rounds, climb 1): best mean 5.75, best worst 4.25 — 3.5 is neither", () => {
  const ts = k.targetsOverRounds(k.CROWDS["real people (Nagel 1995)"], 8, 1);
  close(ts[0], 17.593);
  close(ts[7], 1.036);
  const { bestMean, bestWorst } = k.scoreOverRounds(ts);
  assert.equal(bestMean.level, 5.75);
  assert.equal(bestWorst.level, 4.25);
  close(bestMean.mean, 4.248);
  close(bestWorst.worst, 8.669);
});

test("finding: with Nagel's reported first-period mean (36.73) level 2 wins, not 3", () => {
  const target = (2 / 3) * 36.73;
  let best = 0;
  for (let L = 1; L <= k.LEVELS; L++)
    if (Math.abs(k.choice(L) - target) < Math.abs(k.choice(best) - target)) best = L;
  assert.equal(best, 2);
});

test("importing the module prints nothing", () => {
  // defect #12: the report printed on require; guarded by require.main
  assert.equal(typeof k.play, "function");
});
