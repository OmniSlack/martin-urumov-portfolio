"use strict";

/**
 * The Keynesian beauty contest, eleven levels deep — and why the deepest
 * player loses.
 *
 * Keynes, 1936 (The General Theory, ch. 12): a newspaper contest where readers
 * pick the six prettiest faces from a hundred photographs, and the prize goes
 * to whoever picks closest to the average preference. It is not won by picking
 * the prettiest faces. It is not even won by picking what you think the average
 * opinion is. It is won by anticipating what average opinion expects average
 * opinion to be ("the third degree"; Keynes adds that some practise "the
 * fourth, fifth and higher degrees").
 *
 * In its measurable form — the p-beauty contest — everyone names a number
 * between 0 and 100 and the winner is closest to p times the average.
 * Iterated reasoning gives a ladder:
 *
 *     level 0   50.000      does not reason about others
 *     level 1   33.333      assumes everyone is at level 0
 *     level 2   22.222      assumes everyone is at level 1
 *     ...
 *     level 11   0.578
 *     level ∞    0          the Nash equilibrium
 *
 * THE RESULT
 *
 * Against the crowd labelled "real people" below — most at levels 1 and 2,
 * few deeper — the target is 17.59 and the winner is LEVEL 3. Level 11 misses
 * by 17.0, and the equilibrium misses by 17.6. (The original said "worse than
 * level 0"; level 0 misses by 32.4, so that was false — corrected 2026-10-26.)
 *
 * ⚠️ That crowd is an ASSUMED distribution, not Nagel's data. Its mean is
 * 26.39; Nagel (1995) reports a first-period mean of 36.73 for p = 2/3. See
 * the README, Findings.
 *
 * Perfect reasoning loses to every finite level from 1 to 11.
 *
 * The reason matters more than the result: every level is CORRECT reasoning
 * on a FALSE premise — that the others are already one level below. It is
 * confidence compounded from a single unexamined root. Eleven valid steps from
 * a wrong start end further from the answer than no steps at all.
 *
 * OPEN PALM — why "level 3" is not the answer either
 *
 * Hold a model with an open palm, so that data can kill it. Applied here, it
 * says that "level 3 wins" is exactly the kind of answer that must not be
 * closed into a fist. Measured:
 *
 *     novices, never played        target 28.15    level 1 wins
 *     real people (assumed)        target 17.59    level 3 wins
 *     players who have played      target  8.78    level 4 wins
 *     theorists only               target  0.78    level 10 wins
 *
 * The winning level is not a property of the game. It is a property of who is
 * sitting across from you. Writing down "3" would lose by seven levels against
 * a room of theorists.
 *
 * So the answer is not a number. It is a procedure:
 *
 *     measure where they actually are, and stand one level above that
 *
 * A number goes stale. A procedure does not.
 *
 * HOLDING BETWEEN — the half level
 *
 * Martin Urumov, same evening: "3.5 exactly", and then "after it has turned
 * over" — after the game repeats and the crowd learns.
 *
 * In a single round a fractional level is pointless; you name one number and
 * one level is closest. Across a REPEATED game where the crowd gets deeper
 * each round, it is not.
 *
 * ⚠️ RETRACTED ON 19 SEPTEMBER 2026 — see defect #20 below.
 *
 * These three lines stood here, and they were the MAIN result of the report
 * built on this file:
 *
 *     level 3     mean error 5.93    worst 10.42
 *     level 3.5   mean error 5.24    worst 10.29    <- best worst case
 *     level 4     mean error 5.12    worst 12.51    <- best mean
 *
 * No line of code produced them. Written once, carried into the report, cited
 * onwards, never counted. Left here on purpose: a corrected error that cannot
 * be seen teaches nobody.
 *
 * Computed by the code, with the model written out at defect #20, against the
 * "real people" crowd over eight rounds with a step of 1:
 *
 *     level 3      mean 9.168    worst 13.779
 *     level 3.5    mean 7.130    worst 11.061
 *     level 4      mean 5.928    worst  8.841
 *     level 4.25   mean 5.452    worst  8.669   <- best worst
 *     level 5.75   mean 4.248    worst 12.735   <- best mean
 *
 * 3.5 does NOT survive — neither as best mean nor as best worst.
 *
 * The distinction between the two questions DOES survive, and it was the core:
 *
 *     mean error  -> which level wins most often
 *     worst error -> which level never loses badly
 *
 * (The original comment also stated a 27-configuration sweep — three crowds
 * by three lengths by three learning rates — with a fractional best-worst
 * level in 14 of 27. No code for that sweep exists; the claim is not carried
 * here as a result. See the README.)
 *
 *     node keynes_beauty_contest.js
 */

const P = 2 / 3;
const LEVELS = 11;

/** What a player at level k names. */
const choice = (k, p = P) => 50 * Math.pow(p, k);

/** Crowds, as distributions over levels. */
const CROWDS = {
  "novices, never played": { 0: 0.6, 1: 0.3, 2: 0.1 },
  "real people (Nagel 1995)": { 0: 0.1, 1: 0.35, 2: 0.3, 3: 0.15, 4: 0.06, 5: 0.03, 6: 0.01 },
  "players who have played": { 2: 0.2, 3: 0.3, 4: 0.3, 5: 0.2 },
  "theorists only": { 8: 0.25, 9: 0.25, 10: 0.25, 11: 0.25 },
  "half naive, half deep": { 0: 0.5, 11: 0.5 },
};

function play(distribution, p = P) {
  let sum = 0;
  let n = 0;
  for (const [k, share] of Object.entries(distribution)) {
    sum += choice(Number(k), p) * share;
    n += share;
  }
  const average = sum / n;
  const target = p * average;
  let best = null;
  for (let k = 0; k <= LEVELS; k++) {
    const err = Math.abs(choice(k, p) - target);
    if (!best || err < best.err) best = { level: k, err, choice: choice(k, p) };
  }
  return { average, target, best };
}

/**
 * DEFECT #20 — the most serious one in this file, found on 19 September 2026.
 *
 * The numbers for the repeated game — "level 3.5, best worst error" — STOOD
 * IN A COMMENT. No line of code produced them. Written once, carried into the
 * report, cited onwards, and never counted.
 *
 * Same class as other numbers in the project that were true once in someone's
 * head and from then on only copied. Worse by one thing: this was the MAIN
 * result of the report.
 *
 * From here on it is computed. The model is written out, because the answer
 * depends on it:
 *
 *   - everyone in the crowd climbs `step` levels per round, capped at LEVELS;
 *   - each round's target is p times the crowd's average for THAT round;
 *   - the player picks ONE level and holds it through all rounds;
 *   - the error for a round is the distance to the target; mean and worst
 *     are measured.
 *
 * ⚠️ The boundary that must not be removed: this is a model of learning, not
 * a measurement of learning. Change `step` or the number of rounds and the
 * answer moves. That is exactly why the function takes both as parameters
 * instead of hard-coding them.
 */
function learn(distribution, step = 1, cap = LEVELS) {
  const next = {};
  for (const [k, share] of Object.entries(distribution)) {
    const nk = Math.min(Number(k) + step, cap);
    next[nk] = (next[nk] || 0) + share;
  }
  return next;
}

/** The target for each round, while the crowd learns. */
function targetsOverRounds(start, rounds = 8, step = 1, p = P) {
  const out = [];
  let d = start;
  for (let r = 0; r < rounds; r++) {
    out.push(play(d, p).target);
    d = learn(d, step);
  }
  return out;
}

/**
 * For each level on a `grain` grid: the mean and the worst error across rounds.
 * Returns both winners, because they answer DIFFERENT questions.
 */
function scoreOverRounds(targets, grain = 0.25, p = P) {
  const rows = [];
  const steps = Math.round(LEVELS / grain);
  for (let i = 0; i <= steps; i++) {
    const level = +(i * grain).toFixed(4);
    const errs = targets.map((t) => Math.abs(choice(level, p) - t));
    rows.push({
      level,
      mean: errs.reduce((a, b) => a + b, 0) / errs.length,
      worst: Math.max(...errs),
    });
  }
  const bestMean = rows.reduce((a, b) => (b.mean < a.mean ? b : a));
  const bestWorst = rows.reduce((a, b) => (b.worst < a.worst ? b : a));
  return { rows, bestMean, bestWorst };
}

// Defect #12: this file printed its whole report the moment it was required,
// so any module importing choice() or play() got a page of output it never
// asked for. A module does nothing on import; only a program run directly
// does something. Found by a demo script on its first run.
if (require.main === module) {
console.log("KEYNES — eleven levels, and which one wins\n");

console.log("The ladder:");
for (let k = 0; k <= LEVELS; k++) {
  console.log(`  level ${String(k).padStart(2)}   names ${choice(k).toFixed(3).padStart(8)}`);
}
console.log(`  level  ∞   names    0.000    (Nash equilibrium)\n`);

console.log("Against real people:");
const real = play(CROWDS["real people (Nagel 1995)"]);
console.log(`  target ${real.target.toFixed(3)}`);
for (const k of [0, 3, 11]) {
  const err = Math.abs(choice(k) - real.target);
  const tag = k === real.best.level ? "  <- wins" : "";
  console.log(`  level ${String(k).padStart(2)} misses by ${err.toFixed(3).padStart(7)}${tag}`);
}
// Corrected 2026-10-26: the original line said "worse than level 0". Level 0
// misses by 32.407, the equilibrium by 17.593 — the equilibrium is closer than
// level 0 and loses to every level from 1 to 11. What survives: it loses by
// far more than the winner.
console.log(`  equilibrium misses by ${real.target.toFixed(3)} — closer than level 0, more than six times further than the winner.\n`);

console.log("The same game, different crowds:");
const w = Math.max(...Object.keys(CROWDS).map((c) => c.length));
for (const [name, dist] of Object.entries(CROWDS)) {
  const r = play(dist);
  console.log(`  ${name.padEnd(w)}  target ${r.target.toFixed(2).padStart(6)}   level ${r.best.level} wins`);
}

console.log("");
console.log("The winning level is not a property of the game. It is a property");
console.log("of who is across from you — so the answer is not a number:");
console.log("");
console.log("    measure where they are, and stand one level above that");
console.log("");
console.log("Every level above that is correct reasoning on a false premise.");
console.log("Eleven valid steps from a wrong start land further away than none.");

// Defect #20: until here this stood only in a comment. Now it is computed.
const ROUNDS = 8;
const STEP = 1;
const ts = targetsOverRounds(CROWDS["real people (Nagel 1995)"], ROUNDS, STEP);
const { rows, bestMean, bestWorst } = scoreOverRounds(ts);

console.log(`\nThe repeated game — ${ROUNDS} rounds, everyone climbs ${STEP} level per round:`);
ts.forEach((t, i) => console.log(`  round ${String(i + 1).padStart(2)}   target ${t.toFixed(3).padStart(7)}`));

console.log("\n  level    mean error    worst error");
for (const r of rows) {
  if (r.level < 3 || r.level > 6 || (r.level * 4) % 1 !== 0) continue;
  const tagM = r.level === bestMean.level ? "  <- best mean" : "";
  const tagW = r.level === bestWorst.level ? "  <- best worst" : "";
  console.log(`  ${String(r.level).padStart(5)}  ${r.mean.toFixed(3).padStart(11)}  ${r.worst.toFixed(3).padStart(13)}${tagW}${tagM}`);
}

console.log(`\n  best mean  : level ${bestMean.level}  (mean ${bestMean.mean.toFixed(3)}, worst ${bestMean.worst.toFixed(3)})`);
console.log(`  best worst : level ${bestWorst.level}  (mean ${bestWorst.mean.toFixed(3)}, worst ${bestWorst.worst.toFixed(3)})`);
console.log("\n  The comment above this code claimed level 3.5 on both counts.");
console.log("  It was never computed. It does not survive being computed.");
console.log("  The DISTINCTION it was making does survive: mean and worst are");
console.log("  different questions with different answers.");
console.log("\n  Model, not measurement: change the rounds or the climb rate and");
console.log("  the answer moves. That is the report's own thesis applied to itself.");
}

module.exports = {
  choice, play, CROWDS, P, LEVELS,
  learn, targetsOverRounds, scoreOverRounds,
};
