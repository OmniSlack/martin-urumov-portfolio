"use strict";
/**
 * The reaction gap as drift-diffusion (Bogacz et al.).
 *   dX = mu*dt + sigma*dW,  absorbing thresholds at +a and -a
 *   threshold a = how long you wait before deciding
 *
 * TWO claims are checked, separately:
 *   C1  a higher threshold  ->  more accurate but slower   (mu > 0, there is a signal)
 *   C2  without new information (mu = 0) waiting improves NOTHING
 *
 * Plus a cross-check: the simulation against the closed form
 *   P(correct) = 1 / (1 + exp(-2*mu*a/sigma^2))
 * Two independent means for one number — exactly what 3 copies of one source
 * are NOT.
 *
 *     node verify/reaction-gap-ddm.js
 */
const SIGMA = 1, DT = 0.001, TRIALS = 40000;

// deterministic generator (mulberry32) — with Math.imul so precision is not lost
let seed = 12345;
const rnd = () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
// Box–Muller, both values are used — nothing is discarded
let spare = null;
const gauss = () => {
  if (spare !== null) { const s = spare; spare = null; return s; }
  const r = Math.sqrt(-2 * Math.log(1 - rnd())), th = 2 * Math.PI * rnd();
  spare = r * Math.sin(th);
  return r * Math.cos(th);
};

// self-check of the generator before trusting it
{
  const N = 200000; let s = 0, s2 = 0;
  for (let i = 0; i < N; i++) { const g = gauss(); s += g; s2 += g * g; }
  const mean = s / N, sd = Math.sqrt(s2 / N - mean * mean);
  const ok = Math.abs(mean) < 0.01 && Math.abs(sd - 1) < 0.01;
  console.log(`generator: mean ${mean.toFixed(4)} (target 0) · sd ${sd.toFixed(4)} (target 1) → ${ok ? "✓ usable" : "✗ NOT USABLE"}\n`);
  if (!ok) process.exit(1);
}

function run(mu, a) {
  let correct = 0, steps = 0;
  for (let i = 0; i < TRIALS; i++) {
    let x = 0, t = 0;
    while (Math.abs(x) < a && t < 200000) {
      x += mu * DT + SIGMA * Math.sqrt(DT) * gauss();
      t++;
    }
    if (x >= a) correct++;
    steps += t;
  }
  return { acc: correct / TRIALS, time: (steps / TRIALS) * DT };
}

const theory = (mu, a) => 1 / (1 + Math.exp(-2 * mu * a / (SIGMA * SIGMA)));

/**
 * Mean decision time — the closed form that was missing.
 *
 *     T = (a / μ) · tanh(a·μ / σ²)
 *
 * Accuracy had a formula here from the start; time was only measured. So half
 * of what this file describes stood unchecked — and that half is exactly the
 * COST of the gap: how many seconds the better answer costs.
 *
 * As μ → 0, tanh(x) → x and the expression tends to a²/σ², which is pure
 * diffusion: without drift a decision still comes, but the time grows with the
 * SQUARE of the threshold. That is why hesitation without new information is
 * so expensive.
 *
 * BOUNDARY, measured rather than assumed: at a small threshold the measured
 * time exceeds the formula — 18.9% at a=0.2 with DT=0.001. This is
 * discretisation, not an error in the formula: the step overshoots the
 * boundary, and the overshoot weighs more the lower the threshold. Checked by
 * shrinking the step:
 *
 *     DT = 0.001     18.9%
 *     DT = 0.0002     8.0%
 *     DT = 0.00005    4.0%
 *
 * The error halves with every fourfold shrink and tends to zero. At a >= 0.8
 * the discrepancy is under 5% even at the current step.
 */

/**
 * A SECOND BOUNDARY, more important than the first: everything here is
 * ONE-DIMENSIONAL.
 *
 * The second table shows μ = 0 and concludes "waiting brings nothing". That is
 * true for the axis being measured and NOT true for the world. Measured at
 * a = 0.8, 20,000 trials:
 *
 *   signal entirely along Y      along X:       50.1% in 0.666s
 *                                along radius:  63.2% in 0.328s
 *
 *   the same signal, at 45°      along X:       64.2%
 *                                along radius:  63.1%
 *
 * The same world. The observer along X sees zero in the first case and 64% in
 * the second, because the second time it happened to be oriented correctly —
 * not because anything changed. And it pays double the time for the zero.
 *
 * So μ = 0 means "no signal ALONG THE AXIS I AM LOOKING AT", not "no signal".
 * The one-dimensional model cannot distinguish the two, and that is its
 * limit, not a property of the gap.
 *
 * The boundary was pointed out by Martin Urumov, 18 September 2026, and is
 * confirmed by measurement rather than taken on trust.
 */
const theoryTime = (mu, a) =>
  mu === 0 ? (a * a) / (SIGMA * SIGMA)
           : (a / mu) * Math.tanh((a * mu) / (SIGMA * SIGMA));

const row = (l, acc, time, th, tt) =>
  `  threshold ${l}  accuracy ${(acc * 100).toFixed(1).padStart(5)}%` +
  (th === null ? "" : ` / formula ${(th * 100).toFixed(1).padStart(5)}% ${Math.abs(acc - th) * 100 < 1.5 ? "✓" : "✗"}`) +
  `   time ${time.toFixed(3).padStart(6)}s` +
  (tt === undefined ? "" : ` / formula ${tt.toFixed(3).padStart(6)}s ${Math.abs(time - tt) / tt < 0.05 ? "✓" : "✗"} ${(Math.abs(time - tt) / tt * 100).toFixed(1)}%`);

console.log("C1 · THERE IS a signal (mu = 0.5) — a higher threshold must be more accurate and slower\n");
const A = [0.2, 0.4, 0.8, 1.6];
const r1 = A.map(a => ({ a, ...run(0.5, a), th: theory(0.5, a) }));
for (const r of r1) console.log(row(String(r.a).padEnd(4), r.acc, r.time, r.th, theoryTime(0.5, r.a)));

const monoAcc  = r1.every((r, i) => i === 0 || r.acc  > r1[i - 1].acc);
const monoTime = r1.every((r, i) => i === 0 || r.time > r1[i - 1].time);
console.log(`\n  accuracy grows with the threshold:  ${monoAcc  ? "✓ YES" : "✗ NO"}`);
console.log(`  time grows with the threshold:      ${monoTime ? "✓ YES" : "✗ NO"}`);
console.log(`  cost: going from ${(r1[0].acc*100).toFixed(1)}% to ${(r1[3].acc*100).toFixed(1)}% accuracy costs ` +
            `${(r1[3].time / r1[0].time).toFixed(1)}x more time`);

console.log("\n\nC2 · NO signal (mu = 0) — waiting brings nothing\n");
const r2 = A.map(a => ({ a, ...run(0, a) }));
for (const r of r2) console.log(row(String(r.a).padEnd(4), r.acc, r.time, null));

const flat = r2.every(r => Math.abs(r.acc - 0.5) < 0.015);
console.log(`\n  accuracy stays at 50% at every threshold:  ${flat ? "✓ YES" : "✗ NO"}`);
console.log(`  time grows ${(r2[3].time / r2[0].time).toFixed(0)}x, accuracy does not move`);
console.log("\nCONSEQUENCE: the gap buys accuracy only while a signal COMES IN through it.");
console.log("Waiting alone buys only time.");
