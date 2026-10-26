"use strict";

/**
 * Can a cached answer be told apart from work that was actually done?
 *
 * The question matters because mirror.js rests on its observers being
 * independent, and four observers reading one cached value produce four
 * identical records that agree perfectly and establish nothing.
 *
 * FIRST ATTEMPT, AND WHY IT FAILED — defect #11
 *
 * mirror.js first tested the SPREAD of three timings: CV = σ/μ, with a floor
 * below which independence was refused. Measured against the case it was
 * written for, it gave the wrong answer:
 *
 *     cached, four coats    CV = 1.03
 *     genuine work          CV = 0.53
 *
 * The cached case scored HIGHER. Three samples are dominated by warm-up — the
 * first call ran at 8610 ns and the third at 761 ns — and that ordering effect
 * is larger than anything the test was looking for. A floor on CV measures
 * processor state, not independence. The gate was withdrawn.
 *
 * THE PROTOCOL THAT WORKS — Martin, 18 September 2026
 *
 *   "you do 10, you stop, you wait a whole minute, and then you do the 11th"
 *
 * Ten samples, take the MEDIAN, pause, then an eleventh series for comparison.
 * A median discards the warm-up that destroyed the spread; the pause returns
 * the machine to a comparable state instead of measuring the tail of the
 * previous burst.
 *
 * The separation had been there the whole time and is large:
 *
 *     first ten, warm       cache 448 ns   work 8083 ns    18.0x
 *     eleventh, after 60s   cache 230 ns   work 4663 ns    20.3x
 *
 * This file exists so that those two lines are not a story. Run it and it
 * measures again, on whatever machine you have.
 *
 *     node verify/timing.js           # ten, in one burst  (~1 second)
 *     node verify/timing.js --pause   # ten, a minute, then eleven
 *
 * ⚠️ WHAT IT SHOWS AND DOES NOT
 *
 * It shows that a returned-from-cache value and a computed one differ in cost
 * by more than an order of magnitude, and that the difference survives the
 * pause. It does NOT show that any particular observer cheated: a caller who
 * wants agreement can compute honestly four times and still be wrong four
 * times. Timing separates recomputation from reuse. It says nothing about
 * whether the thing recomputed is true.
 */

const { Core } = require("../core.js");

const N = 10;
const PAUSE_MS = 60_000;

const core = new Core();
const stimulus = { source: "doc", provenance: "signed" };
const context = { counterModelTested: true };
const cached = core.evaluate(stimulus, context);

const nanos = (fn) => {
  const t0 = process.hrtime.bigint();
  fn();
  return Number(process.hrtime.bigint() - t0);
};

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function series(label, n = N) {
  const reuse = [];
  const recompute = [];
  for (let i = 0; i < n; i++) {
    reuse.push(nanos(() => cached));
    recompute.push(nanos(() => core.evaluate(stimulus, context)));
  }
  const r = median(reuse);
  const w = median(recompute);
  const ratio = w / r;
  console.log(
    `${label.padEnd(22)} reuse ${String(r).padStart(7)} ns   ` +
      `recompute ${String(w).padStart(7)} ns   ratio ${ratio.toFixed(1)}x`
  );
  return { reuse: r, recompute: w, ratio, n };
}

console.log("TIMING — can reuse be told from recomputation?\n");
console.log(`${N} samples per series, median taken (not spread: see defect #11).\n`);

const warm = series("first ten, warm");

if (!process.argv.includes("--pause")) {
  console.log("");
  console.log(
    warm.ratio > 3
      ? `Separated: recomputation costs ${warm.ratio.toFixed(1)}x a reuse.`
      : `NOT separated: ratio ${warm.ratio.toFixed(1)}x is too small to rely on.`
  );
  console.log("\nRun with --pause for the eleventh series after a minute.");
  process.exit(warm.ratio > 3 ? 0 : 1);
}

console.log("\nwaiting 60s — the machine returns to a comparable state ...\n");
setTimeout(() => {
  const cold = series("eleventh, after 60s", N + 1);
  console.log("");
  console.log(`warm   ${warm.ratio.toFixed(1)}x`);
  console.log(`cold   ${cold.ratio.toFixed(1)}x`);
  console.log("");
  console.log(
    cold.ratio >= warm.ratio
      ? "The pause widens the gap: it does not merely fail to hurt."
      : "The pause narrowed the gap on this machine — the claim does not hold here."
  );
  console.log("");
  console.log("This separates reuse from recomputation. It says nothing about");
  console.log("whether what was recomputed is true.");
  process.exit(cold.ratio > 3 ? 0 : 1);
}, PAUSE_MS);
