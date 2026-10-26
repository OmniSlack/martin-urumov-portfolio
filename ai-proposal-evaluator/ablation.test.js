"use strict";

/**
 * Pins the MINIMAL MODEL TEST — `verify/gate-ablation.js`.
 *
 * The instrument that checks whether the gates do any work itself needs a
 * check that IT does work. Otherwise it is exactly what it looks for:
 * something that looks like a safeguard.
 *
 * Source of the method: Martin Urumov, `05_MINIMAL_MODEL_TEST.md`, 28 July 2026.
 *
 * THE NEGATIVE CHECK is built into A4 and A5: they make the disabling do
 * nothing and require the test to fail. A test that passes even when the
 * instrument is broken checks nothing.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { ablate, gatesInCore, loadVariant, utility, CASES } =
  require("./verify/gate-ablation.js");
const { Core } = require("./core.js");

const SRC = fs.readFileSync(path.join(__dirname, "core.js"), "utf8");

test("A1. the baseline is clean: the full code gets every expected result", () => {
  const r = utility(Core, CASES);
  const miss = CASES
    .map((k, i) => (r.got[i] === k.expect ? null : `${k.id}: ${k.expect}→${r.got[i]}`))
    .filter(Boolean);
  assert.deepStrictEqual(miss, [],
    "Expectations were written before the run. A mismatch means a wrong corpus.");
});

test("A2. the corpus is not tautological — it requires all three decisions", () => {
  const kinds = new Set(CASES.map((c) => c.expect));
  assert.deepStrictEqual([...kinds].sort(), ["CLEAR", "HOLD", "STOP"]);
});

test("A3. disabling a non-existent gate changes nothing", () => {
  assert.strictEqual(ablate(SRC, 9999), null);
});

test("A4. disabling really removes the gate's decision", () => {
  const a = ablate(SRC, 8);
  assert.ok(a && a.touched > 0, "gate 08 must have at least one decision");

  const M = loadVariant(a.source);
  const k = CASES.find((x) => x.id === "4.2");
  const r = new M.Core().evaluate(structuredClone(k.p), structuredClone(k.c));

  assert.notStrictEqual(r.decision, k.expect,
    "Without gate 08 case 4.2 MUST pass. If it does not, the disabling " +
    "does not work and the whole table below is fiction.");
  assert.ok(r.reasons.some((x) => /Gate 08/.test(x)),
    "The reason deliberately stays: the decision is measured, not the length of the output.");
});

test("A5. every gate in core.js has an independent contribution", () => {
  const base = utility(Core, CASES);
  const noEffect = [];

  for (const g of gatesInCore(SRC)) {
    const a = ablate(SRC, g);
    if (!a) continue;
    const r = utility(loadVariant(a.source).Core, CASES);
    if (r.hit === base.hit) noEffect.push(g);
  }

  assert.deepStrictEqual(noEffect, [],
    "A gate whose removal changes no decision is dropped under the " +
    "05_MINIMAL_MODEL_TEST rule. If this test fails, the decision is human: " +
    "either the gate is shadowed and goes, or the case only it catches is " +
    "missing — and is added to the corpus. The first run gave exactly that " +
    "for gates 13, 14 and 15; the cases were missing, not the contribution.");
});

test("A6. the instrument leaves no temporary files", () => {
  const before = fs.readdirSync(__dirname).filter((f) => f.startsWith(".ablation-"));
  loadVariant(ablate(SRC, 8).source);
  const after = fs.readdirSync(__dirname).filter((f) => f.startsWith(".ablation-"));
  assert.deepStrictEqual(after, before);
});
