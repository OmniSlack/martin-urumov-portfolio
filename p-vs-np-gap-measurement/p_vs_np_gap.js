"use strict";

/**
 * P versus NP — not solved, MEASURED where it can be measured.
 *
 * THE PROBLEM, IN TWO SENTENCES
 *
 * P is the class of problems a machine solves fast. NP is the class of
 * problems whose ANSWER a machine checks fast, even if finding it is slow.
 * The question is whether the two are the same: if checking is fast, must
 * finding be fast too?
 *
 * ⚠️ WHAT THIS FILE DOES NOT DO, STATED BEFORE ANYTHING ELSE
 *
 * It does NOT solve the problem and does not contribute to solving it. It
 * measures the gap between finding and checking for ONE algorithm on ONE kind
 * of instance.
 *
 * That this algorithm is slow does not mean a fast one does not exist. That is
 * the whole difficulty: proving that NO algorithm can, including ones nobody
 * has invented. No measurement reaches that far.
 *
 * We measure the gap the question asks about. We do not answer the question.
 *
 * WHY SUBSET SUM
 *
 * Given n numbers and a target, find a subset that sums to the target.
 *
 *   finding    exhaust all 2^n subsets
 *   checking   one addition of at most n numbers
 *
 * The certificate is the subset itself: n bits. The search space is 2^n.
 * The gap between the two is the shape of the whole question.
 *
 * WHY STEPS ARE COUNTED, NOT ONLY TIME MEASURED
 *
 * Time depends on the machine, the load and the moment. Two runs give two
 * answers and neither reproduces. The step count is the same everywhere and
 * always. Time is measured (and returned by measure()), declared as unstable.
 *
 *     node p_vs_np_gap.js [max_n]      (max_n ≤ 30: the bitmask is 32-bit)
 */

/** Deterministic generator (xorshift32), so the instances are the same on every run. */
function* xorshift(seed) {
  let s = seed >>> 0;
  for (;;) {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;  s >>>= 0;
    yield s;
  }
}

/**
 * An instance we KNOW has an answer: a subset is embedded on purpose.
 * An instance without an answer would measure something else — how fast the
 * emptiness is exhausted. Both are used below, for different columns.
 */
function makeInstance(n, seed) {
  const g = xorshift(seed);
  // The numbers are EVEN on purpose. That allows a target that certainly has
  // no answer — an odd one — without tricking the algorithm with something
  // obvious like "larger than the total".
  const numbers = Array.from({ length: n }, () => ((g.next().value % 4500) + 500) * 2);
  const hidden = [];
  for (let i = 0; i < n; i++) if ((g.next().value & 3) === 0) hidden.push(i);
  if (!hidden.length) hidden.push(0);
  const target = hidden.reduce((a, i) => a + numbers[i], 0);
  return { numbers, target, hidden, targetWithoutAnswer: target + 1 };
}

/** CHECKING. The certificate is a list of positions; add them up and compare. */
function check(numbers, target, certificate) {
  let steps = 0, sum = 0;
  for (const i of certificate) { sum += numbers[i]; steps++; }
  steps++;
  return { valid: sum === target, steps };
}

/**
 * FINDING, by exhaustion. Deliberately naive: this is the algorithm being
 * measured, not the best known one. Better ones exist for this problem —
 * dynamic programming, and meet-in-the-middle — and they are named in the
 * output so this curve is not read as "it must be so".
 */
function find(numbers, target, cap = Infinity) {
  const n = numbers.length;
  let steps = 0;
  for (let mask = 0; mask < (1 << n); mask++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      steps++;
      if (mask & (1 << i)) sum += numbers[i];
      if (steps > cap) return { found: null, steps, stopped: true };
    }
    steps++;
    if (sum === target) {
      const subset = [];
      for (let i = 0; i < n; i++) if (mask & (1 << i)) subset.push(i);
      return { found: subset, steps, stopped: false };
    }
  }
  return { found: null, steps, stopped: false };
}

/**
 * DEFECT, FOUND BY LOOKING AT THE OUTPUT OF THE FIRST VERSION
 *
 * The first version measured only "until an answer is found". Its output did
 * NOT grow:
 *
 *     n=18   2 918 723 steps
 *     n=20     617 064 steps
 *     n=22     545 859 steps
 *
 * The cause: the search stops at the FIRST answer found, and where that sits
 * in the order of masks is random. The curve measured LUCK, not difficulty.
 *
 * And the summary under it compared only the two ends — from 113 to 60 651 —
 * which hid that it falls in the middle. A number true for the ends and false
 * for the path.
 *
 * So the SECOND case is now measured too: a target that certainly has no
 * answer. There the exhaustion is complete and the step count is
 * deterministic — that is the shape the question asks about.
 */
function measure(n, seed = 20260919) {
  const { numbers, target, hidden, targetWithoutAnswer } = makeInstance(n, seed);

  // Full exhaustion: deterministic, always grows.
  const e0 = process.hrtime.bigint();
  const exhaustion = find(numbers, targetWithoutAnswer);
  const e1 = process.hrtime.bigint();

  const t0 = process.hrtime.bigint();
  const firstHit = find(numbers, target);
  const t1 = process.hrtime.bigint();

  // The SAME certificate is checked every time — the embedded subset — so the
  // measure does not depend on which answer happened to be found first.
  const t2 = process.hrtime.bigint();
  const verdict = check(numbers, target, hidden);
  const t3 = process.hrtime.bigint();

  return {
    n,
    exhaustionSteps: exhaustion.steps,
    exhaustionMs: Number(e1 - e0) / 1e6,
    exhaustionFound: exhaustion.found !== null,
    searchSpace: Math.pow(2, n),
    certificateBits: n,
    firstHitSteps: firstHit.steps,
    checkSteps: verdict.steps,
    ratio: firstHit.steps / verdict.steps,
    found: firstHit.found !== null,
    checkPassed: verdict.valid,
    firstHitMs: Number(t1 - t0) / 1e6,
    checkMs: Number(t3 - t2) / 1e6,
  };
}

if (require.main === module) {
  const maxN = Number(process.argv[2]) || 22;

  console.log("P versus NP — a measured gap, not a solved problem\n");
  console.log("Subset sum: given n numbers and a target, find a subset");
  console.log("that sums to the target.\n");
  console.log("  n   search space   EXHAUSTION steps   first-hit steps   check steps   ratio");

  const rows = [];
  for (let n = 8; n <= maxN; n += 2) {
    const r = measure(n);
    rows.push(r);
    console.log(
      `${String(r.n).padStart(3)}  ${String(r.searchSpace).padStart(13)}  ` +
      `${String(r.exhaustionSteps).padStart(17)}  ${String(r.firstHitSteps).padStart(16)}  ` +
      `${String(r.checkSteps).padStart(12)}  ` +
      `${(r.exhaustionSteps / r.checkSteps).toFixed(0).padStart(10)}`
    );
  }

  const first = rows[0], last = rows[rows.length - 1];

  // Does EVERY step grow, or only the ends? The first version compared only
  // the ends and hid that it falls in the middle.
  const exhaustionAlwaysGrows = rows.every((r, i) =>
    i === 0 || r.exhaustionSteps > rows[i - 1].exhaustionSteps);
  const firstHitAlwaysGrows = rows.every((r, i) =>
    i === 0 || r.firstHitSteps > rows[i - 1].firstHitSteps);

  console.log(`\n  From n=${first.n} to n=${last.n}:`);
  console.log(`    certificate: from ${first.certificateBits} to ${last.certificateBits} bits — LINEAR`);
  console.log(`    search space: from ${first.searchSpace} to ${last.searchSpace} — DOUBLES with every added number`);
  console.log(`    exhaustion: from ${first.exhaustionSteps} to ${last.exhaustionSteps} steps`);
  console.log(`    checking: from ${first.checkSteps} to ${last.checkSteps} steps`);

  console.log(`\n  Does exhaustion grow at EVERY step: ${exhaustionAlwaysGrows ? "yes" : "NO"}`);
  console.log(`  Does the first hit grow at every step: ${firstHitAlwaysGrows ? "yes" : "NO"}`);
  if (!firstHitAlwaysGrows) {
    console.log("    -> nor should it: where the first answer sits is random.");
    console.log("       That column measures LUCK. That is why exhaustion is beside it.");
  }

  console.log("\n  All checks passed: " +
    (rows.every((r) => r.checkPassed) ? "yes" : "NO"));
  console.log("  Exhaustion found no answer where there is none: " +
    (rows.every((r) => !r.exhaustionFound) ? "yes" : "NO"));

  console.log("\n  THE GAP THE QUESTION ASKS ABOUT");
  console.log("    The certificate grows by one number per step of n.");
  console.log("    The search space doubles per step of n.");
  console.log("    Checking stays almost free. Searching does not.");

  console.log("\n⚠️ WHAT THIS DOES NOT PROVE");
  console.log("  That finding is slow with THIS algorithm does not mean a fast one");
  console.log("  does not exist. Subset sum has better algorithms than this one:");
  console.log("  dynamic programming, and meet-in-the-middle. The curve above is");
  console.log("  the curve of exhaustion, not of the problem.");
  console.log("\n  Proving P ≠ NP means showing that NO algorithm can — including");
  console.log("  ones nobody has invented. No measurement reaches that far, and");
  console.log("  that is exactly the difficulty.");
  console.log("\n  We measure the gap the question asks about. We do not answer the question.");
}

module.exports = { makeInstance, check, find, measure };
