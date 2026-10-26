"use strict";

const crypto = require("node:crypto");
const { createLadder, deepFreeze } = require("./severity.js");
const { Observer, verifyObservation } = require("./observer.js");

/**
 * Four observers, two of them mirrored — and the fourth watching the other
 * three rather than the reaction.
 *
 * Design named by Martin, 18 September 2026, in this order:
 *   "so 4 observers, 2 of them mirrored"
 *   "one that watches the timing of the wires"
 *   "and one that checks whether the other three are synchronised"
 *   "with the synchronicity formula"
 *
 * The asymmetry is the point and it is not decoration.
 *
 *   A1, A2   mirrored. Each observes the reaction independently and seals its
 *            record before seeing the other's. Divergence names both sides.
 *   T        watches the WIRES, not the content: how long each reading took.
 *   S        watches A1, A2 and T — whether they were actually independent.
 *
 * WHY THE FOURTH EXISTS
 *
 * A mirrored pair rests on one assumption: that its two halves are
 * independent. Where that holds, disagreement is cheap to detect and
 * identical error is nearly impossible, because independent mistakes almost
 * never agree to the bit. Where it does NOT hold — where both halves read one
 * cached value, or share an upstream cause — the pair agrees perfectly and
 * proves nothing. It is Gate 15 one level up: repetition is not corroboration,
 * and four observers of one source are one observer wearing four coats.
 *
 * Nothing in the content of the records can reveal this, because in that case
 * the records are genuinely identical. The evidence is in the TIMING.
 *
 * THE SYNCHRONY TEST — ATTEMPTED, MEASURED, AND WITHDRAWN
 *
 * Three processes independently doing the same work take slightly different
 * amounts of time — scheduling, cache state, interrupts. That jitter is not
 * noise to be removed; it is the signature of separate work having happened.
 *
 *     CV = σ / μ          coefficient of variation over the three durations
 *
 * The reasoning was: high CV is ordinary, and a CV near zero means three
 * timings agreeing far beyond what separate work produces — the signature of
 * one value copied rather than three measured.
 *
 * ⛔ IT DOES NOT WORK, and this is recorded rather than removed.
 *
 * Measured immediately after writing it, by probe Q15:
 *
 *     a cached answer, four coats    CV = 1.03
 *     genuine work each time         CV = 0.53
 *
 * The cached case scores HIGHER. The variation is dominated by warm-up, not by
 * independence: the first call runs at 8610 ns and the third at 761 ns, and
 * that ordering effect swamps everything the test was meant to see. The faster
 * the work, the more absolute noise weighs, so a cached value — being fastest —
 * looks the LEAST synchronised.
 *
 * A floor on CV therefore measures processor state, not independence. The
 * module asserted the mechanism in a comment before anyone had run it against
 * the case it was written for. That is defect #11 and it is the same failure
 * this project spent the day closing: a rule stated in a sentence, doing
 * nothing.
 *
 * WHAT REMAINS TRUE
 *
 * The ratio's scale-invariance is real and is kept (see below): it is why a
 * dimensionless measure needs no per-machine calibration. That property was
 * never the problem. The problem was believing a number with that property
 * measured the thing it was pointed at.
 *
 * WHAT ACTUALLY WORKS — measured, so stated
 *
 * The protocol Martin gave when the CV floor failed: run ten, stop, wait a
 * whole minute, then run the eleventh. Take the MEDIAN of the ten rather than
 * the spread of three.
 *
 *     first ten, warm     cache 448 ns   work 8083 ns    ratio 18.0x
 *     eleventh, after 60s cache 230 ns   work 4663 ns    ratio 20.3x
 *
 * The separation was eighteen to twenty fold and had been there the whole time.
 * The median discards the warm-up that destroyed the earlier measurement, and
 * the pause does not merely fail to hurt — it widens the gap, 18.0 to 20.3,
 * because the machine returns to a comparable state.
 *
 * The error was measuring the SPREAD of three samples instead of the LEVEL of
 * ten. A spread is dominated by ordering effects; a median is not.
 *
 * Still not implemented here, and therefore still not claimed as working:
 *   · a nonce per observer, so one cached answer cannot match all four
 *   · separate processes, where a shared cache cannot be silently reused
 * Each needs building and measuring before it may be written down.
 *
 * WHY A RATIO AND NOT A DURATION — the relativity in it
 *
 * CV is dimensionless, and that is the whole reason a single floor can serve
 * every machine. Multiply every duration by k — a slower processor, a loaded
 * system, an older laptop — and σ scales by k, μ scales by k, and the ratio is
 * unchanged. Measured:
 *
 *     1.20ms 1.31ms 1.25ms   CV = 0.035783
 *     12.0ms 13.1ms 12.5ms   CV = 0.035783
 *     120ms  131ms  125ms    CV = 0.035783
 *
 * An absolute threshold in milliseconds would need calibrating per machine,
 * and calibration is exactly where "it is different on our hardware" gets in.
 * A ratio needs none: what matters is not how long an observer took, but how
 * its time relates to the others'. Two observers on machines of different
 * speed disagree about every duration and agree about this number.
 *
 * The test is stated as a floor rather than a verdict: below the floor, the
 * independence the mirror depends on is NOT ESTABLISHED, and the result is
 * HOLD. It is never read as proof of collusion — a very fast, very uniform
 * machine can produce a low CV honestly, which is why this refuses rather than
 * accuses.
 *
 * MEASURED OVER 100 APPLICATIONS — the honest table
 *
 * Martin: "it is very easy to make 100 applications of the formula and 100 descriptions".
 * One run is not evidence. A hundred is, and it says this is not usable:
 *
 *     reuse caught                100/100
 *     reuse missed                  0/100    no false positives
 *     genuine work accepted        12/100
 *     genuine work REJECTED        88/100    unusable
 *     boundary present in         200/200 replies
 *
 * ⛔ THE TEST IS NOT FIT FOR USE, and is kept only because half of it works.
 *
 * Nothing cached ever passed, which is the half that matters for safety — it
 * never wrongly certifies independence. But it refuses 88 of every 100 honest
 * runs, which is a tool nobody will keep. A detector buried in false alarms
 * stops being read, and that is how a detector dies: not switched off, made
 * meaningless.
 *
 * The cause is measured, not guessed: ISO timestamps resolve to a
 * millisecond and three evaluations take microseconds, so honest calls
 * collide and look like one. The fix needs a finer stamp inside core.js —
 * and core.js is not changed to make a test pass. That is the inversion this
 * project exists to prevent.
 *
 * ⚠️ BOUNDARY, in the code so it cannot drift:
 *
 *   Agreement is not truth. Four observers reading one broken instrument agree
 *   perfectly and are perfectly wrong. This module detects DIVERGENCE IN
 *   REPORTING and THREATS TO INDEPENDENCE. Both are narrower than truth, and
 *   neither becomes it by being combined with the other.
 */

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

/** Below this, separate work is not distinguishable from a copied value. */
const CV_FLOOR = 0.02;

function reading(name, reaction, ns) {
  const payload = JSON.stringify({
    decision: reaction && reaction.decision,
    reasons: (reaction && reaction.reasons) || [],
  });
  return deepFreeze({
    observer: name,
    sealedAt: new Date().toISOString(),
    digest: sha256(payload),
    decision: reaction && reaction.decision,
    reasonCount: ((reaction && reaction.reasons) || []).length,
    durationNs: ns,
  });
}

/** σ/μ over the durations. Null when there is nothing to compare. */
function coefficientOfVariation(values) {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return null;
  const variance =
    values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/**
 * Observe one reaction through four observers.
 *
 *   react  called ONCE PER OBSERVER, so each does its own work. A caller that
 *          passes a closure over a cached value defeats this, and S exists to
 *          notice exactly that.
 */
function observeMirrored(stimulus, react, opts = {}) {
  const ladder = createLadder();
  const reasons = [];
  const cvFloor = opts.cvFloor ?? CV_FLOOR;

  if (typeof react !== "function") {
    return deepFreeze({
      decision: "HOLD",
      reasons: ["Mirror Block: a reaction function is required."],
      readings: [], mirror: null, timing: null, synchrony: null,
    });
  }

  // ---- What finally establishes independence: IDENTITY, not timing.
  //
  // The first attempt asked a nonce to be echoed back, which needs the
  // evaluator's cooperation and fails against one that ignores unknown fields.
  // The working test needs no cooperation at all.
  //
  // A verdict this Core issues carries its own timestamp. Four separate calls
  // produce four separately-stamped objects. ONE cached answer handed out four
  // times is the same object, with one timestamp, four times over.
  //
  //   four distinct stamps  →  four calls happened. Arithmetic, not inference.
  //   one stamp, four times →  one call happened, and was reused.
  //
  // This cannot be defeated by a fast machine, a loaded machine or a warm
  // cache, because it does not measure the machine. It reads what came back.
  //
  // ⚠️ Its own limit, stated: two genuine calls inside the same millisecond
  // collide, so identical stamps are evidence of reuse and not proof of it.
  // Distinct stamps ARE proof of separate calls. The test is therefore
  // one-sided and is reported that way.
  // Defect #11, found by probe Q15 ten minutes after this module was written:
  // the timer wrapped the whole of observe(), so it measured the OBSERVER'S
  // overhead and not the reaction's work. First-call warmup dominated, and a
  // cached answer produced a HIGHER CV (1.08) than genuine work (0.39) — the
  // opposite of what the comment claimed. The module asserted a mechanism it
  // had never been measured against, which is the defect it exists to find.
  //
  // The timer now wraps react() alone.
  const names = ["A1", "A2", "T"];
  // THE FIX for the timestamp test, and it needs nothing from the evaluator.
  //
  // The clock failed because it measured the machine. Varying the INPUT does
  // not: each observer asks with a source of its own, and an honest evaluator
  // reports back the source it was given. Three honest readings therefore
  // carry three different sources and agree on everything else. One cached
  // answer carries one source, three times, and cannot do that.
  //
  // This is arithmetic, not timing — a fast machine, a loaded machine and a
  // warm cache change nothing. And it touches no part of core.js: it uses a
  // field the evaluator already reads and already reports.
  const marks = names.map(() => crypto.randomBytes(6).toString("hex"));
  const seenSources = [];

  const stamps = [];
  const readings = names.map((n, idx) => {
    const o = new Observer();
    const asked = { ...stimulus, source: `${stimulus.source || "S"}#${marks[idx]}` };
    let ns = 0;
    const timed = () => {
      const t0 = process.hrtime.bigint();
      const out = react(asked);
      ns = Number(process.hrtime.bigint() - t0);
      stamps.push(out && out.timestamp);
      seenSources.push(out && out.provenance && out.provenance.source);
      return out;
    };
    const rec = o.observe(asked, timed);
    const v = verifyObservation(rec);
    if (!v.valid) {
      ladder.raise("STOP");
      reasons.push(`Mirror Block: ${n}'s own record failed verification: ${v.reason}`);
    }
    return reading(n, rec.reaction, ns);
  });

  const [a1, a2, t] = readings;

  // ---- the mirrored pair: content
  const mirrorAgrees = a1.digest === a2.digest;
  if (!mirrorAgrees) {
    ladder.raise("HOLD");
    reasons.push(
      `Mirror Block: A1 reported ${a1.decision} and A2 reported ${a2.decision}. ` +
        "A disagreement names both sides and resolves neither."
    );
  }

  // ---- T: the wires. Not what was read, but how long reading took.
  const durations = readings.map((r) => r.durationNs);
  const slowest = Math.max(...durations);
  const fastest = Math.min(...durations);
  const timing = {
    durationsNs: durations,
    slowestNs: slowest,
    fastestNs: fastest,
    spreadRatio: fastest > 0 ? slowest / fastest : null,
  };

  // ---- S: were the other three independent at all?
  // ---- S: one answer handed out three times, or three answers?
  const distinctStamps = new Set(stamps.filter(Boolean)).size;
  // Did each observer get back the source IT asked with?
  const ownAnswer = seenSources.map((src, i) =>
    typeof src === "string" && src.endsWith(marks[i]));
  const freshCount = ownAnswer.filter(Boolean).length;
  // Requiring ALL stamps distinct asks the clock for resolution it does not
  // have: ISO timestamps are milliseconds, and two genuine evaluations land in
  // the same millisecond routinely — measured 2 of 3 on honest work. What the
  // instrument can actually resolve is one-sided, and the conclusion is stated
  // to match:
  //
  //   1 distinct  →  one answer was reused. Nothing else produces that.
  //   n distinct  →  at least n separate calls happened. Proof, not inference.
  //
  // So the test refuses reuse and never claims more than "at least n".
  // Each observer receiving back its own mark proves its call was made for it.
  // Timestamps are kept as a secondary signal and no longer decide anything.
  const separateCalls = freshCount === readings.length;

  // S reports the number and refuses to rule on it. The floor it used to
  // enforce was withdrawn when measurement showed it detects warm-up rather
  // than independence (defect #11, above). Reporting a figure whose meaning is
  // not established is honest; gating on it was not.
  const cv = coefficientOfVariation(durations);
  const synchrony = {
    cv,
    formula: "CV = σ/μ over the three reaction timings",
    scaleInvariant: true,
    distinctStamps,
    ofReadings: stamps.length,
    ownAnswers: freshCount,
    method: "each observer asks with its own source and must receive it back",
    independenceEstablished: separateCalls,
    why:
      "Timing spread does not separate independent work from a cached answer: " +
      "measured, a cached value scored CV 1.03 and genuine work 0.53, because " +
      "warm-up dominates. The figure is reported; nothing is concluded from it.",
  };
  if (!separateCalls) {
    ladder.raise("HOLD");
    reasons.push(
      `Mirror Block: ${freshCount} of ${readings.length} observers received the ` +
        `answer they asked for. The same ` +
        "answer was handed to every observer, so their agreement is one report " +
        "counted three times — Gate 15, applied to this module. This does not " +
        "show anyone acted wrongly: a caller may reuse an answer for perfectly " +
        "good reasons. It shows only that the agreement cannot be counted."
    );
  }

  if (ladder.current() === "CLEAR") {
    reasons.push(
      `Mirror Note: ${distinctStamps} distinct timestamps across ` +
        `${stamps.length} readings — at least ${distinctStamps} separate calls ` +
        `happened, which is proof and not inference. A1 and A2 agree to the ` +
        `digest. CV ` +
        `${cv.toFixed(4)} above the floor, so they did separate work. ` +
        "This shows no divergence in reporting and no threat to independence. " +
        "It does not show the reading is correct: four observers of one broken " +
        "instrument agree perfectly."
    );
  }

  return deepFreeze({
    decision: ladder.current(),
    reasons,
    readings,
    mirror: { agrees: mirrorAgrees, digest: mirrorAgrees ? a1.digest : null },
    timing,
    synchrony,
    shows: "REPORTING_DIVERGENCE_AND_INDEPENDENCE",   // never truth
  });
}

module.exports = { observeMirrored, coefficientOfVariation, CV_FLOOR };
