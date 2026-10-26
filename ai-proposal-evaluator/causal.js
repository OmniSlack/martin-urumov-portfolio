"use strict";

const { createLadder, deepFreeze, isAnswered, unreadable } = require("./severity.js");

/**
 * Gate 17 — how strongly a causal link is shown.
 *
 * The project's record graded causation with two values, VERIFIED and
 * UNVERIFIED, which forces everything between "they happened together" and
 * "we intervened and measured it" into one of two boxes. Most real evidence
 * lives between them, so the binary either flatters weak evidence or discards
 * good evidence. Four levels, each with a condition rather than a label:
 *
 *   UNKNOWN      nothing links them — and this is the default
 *   CORRELATED   observed co-occurrence; no mechanism, no intervention
 *   SUPPORTED    a named mechanism OR a controlled comparison — not both
 *   VERIFIED     an intervention WITH a control AND a named mechanism
 *
 * Missing data yields UNKNOWN. The grade is never assumed upward, for the same
 * reason Gate 04 fails closed: an unanswered question is not an answer of "no".
 *
 * ⚠ THE BOUNDARY, in the code rather than in a footnote: this grades the SHAPE
 * OF THE EVIDENCE, not the truth of the claim. VERIFIED here means "an
 * intervention with a control, and a mechanism named" — it does not mean the
 * cause is real. A well-run experiment on a wrong hypothesis still grades
 * VERIFIED, and a true cause with no study grades UNKNOWN. The grade describes
 * what was done, and nothing else.
 */

const LEVELS = ["UNKNOWN", "CORRELATED", "SUPPORTED", "VERIFIED"];
const RANK = Object.fromEntries(LEVELS.map((l, i) => [l, i]));

const named = (x) => typeof x === "string" && x.trim().length > 0;

/**
 * The highest level the supplied evidence reaches. Each step is a condition,
 * checked in order, and the first one that fails stops the climb.
 */
function reachedLevel({ coOccurrence, mechanism, intervention, control }) {
  const hasCo = coOccurrence === true;
  const hasMech = named(mechanism);
  const hasInt = intervention === true;
  const hasCtrl = control === true;

  // Nothing observed together and nothing done: there is no link to grade.
  if (!hasCo && !hasInt) return "UNKNOWN";

  // An intervention with a control and a named mechanism is the whole ladder.
  if (hasInt && hasCtrl && hasMech) return "VERIFIED";

  // One of the two supports, but not the pair: a mechanism, or a controlled
  // comparison. An intervention without a control is not a controlled
  // comparison, so it does not reach here on its own.
  if (hasMech || (hasInt && hasCtrl)) return "SUPPORTED";

  // Something was observed together, and nothing further was shown.
  if (hasCo) return "CORRELATED";

  // An intervention with neither control nor mechanism shows only that the
  // two occurred together, which is what CORRELATED says.
  return "CORRELATED";
}

/** Why the climb stopped where it did — stated, so the caller can act on it. */
function shortfall(reached, e) {
  if (reached === "VERIFIED") return null;
  const missing = [];
  if (e.intervention !== true) missing.push("an intervention");
  else if (e.control !== true) missing.push("a control for the intervention");
  if (!named(e.mechanism)) missing.push("a named mechanism");
  if (reached === "UNKNOWN" && e.coOccurrence !== true) {
    missing.push("any observed co-occurrence");
  }
  return missing.length ? missing.join(", ") : null;
}

/**
 * Grade a causal claim.
 *
 *   coOccurrence  true if the two were observed together
 *   mechanism     a named mechanism, as a non-empty string
 *   intervention  true if something was deliberately changed
 *   control       true if the intervention had a control arm
 *   claimedLevel  optional: the level the caller is asserting
 *
 * With a claimedLevel above what the evidence reaches, the decision is HOLD and
 * the reason names the ceiling. Claiming less than the evidence supports is not
 * an error — understating is not the failure this gate exists for.
 */
function gradeCausal(evidence = {}, claimedLevel = null) {
  const ladder = createLadder();
  const reasons = [];

  if (evidence === null || typeof evidence !== "object") {
    ladder.raise("HOLD");
    reasons.push("Gate 17 Block: evidence must be an object describing what was shown.");
    return deepFreeze({
      decision: ladder.current(), reasons, level: "UNKNOWN",
      claimedLevel, missing: null,
    });
  }

  if (claimedLevel !== null && !(claimedLevel in RANK)) {
    ladder.raise("HOLD");
    reasons.push(
      `Gate 17 Block: "${claimedLevel}" is not a level. ` +
        `The ladder is ${LEVELS.join(" → ")}.`
    );
    return deepFreeze({
      decision: ladder.current(), reasons, level: "UNKNOWN",
      claimedLevel, missing: null,
    });
  }

  // ⚠️ FIX 2026-10-10. `reachedLevel` compares with `=== true` by name.
  // So `intervention: "yes"` is neither true nor false — it is simply not
  // counted, silently, and the level drops without anyone saying why. An
  // unknown input must not be read as "no".
  const booleanFields = ["coOccurrence", "intervention", "control"];
  const unreadableFields = booleanFields
    .filter((k) => evidence[k] !== undefined && !isAnswered(evidence[k]))
    .map((k) => `${k} (${unreadable(evidence[k], "true or false")})`);
  if (unreadableFields.length > 0) {
    ladder.raise("HOLD");
    reasons.push(
      `Gate 17 Block: unreadable answer, neither true nor false: ${unreadableFields.join("; ")}.`
    );
    return deepFreeze({
      decision: ladder.current(), reasons, level: "UNKNOWN",
      claimedLevel, missing: null,
    });
  }

  const level = reachedLevel(evidence);
  const missing = shortfall(level, evidence);

  if (claimedLevel !== null && RANK[claimedLevel] > RANK[level]) {
    ladder.raise("HOLD");
    reasons.push(
      `Gate 17 Block: ${claimedLevel} claimed, ${level} reached. ` +
        (missing ? `Missing: ${missing}.` : "")
    );
  }

  if (level === "UNKNOWN" && claimedLevel === null) {
    reasons.push(
      "Gate 17 Note: nothing links these. UNKNOWN is the default and is not " +
        "a weak yes."
    );
  }

  return deepFreeze({
    decision: ladder.current(),
    reasons,
    level,
    claimedLevel,
    missing,
    grades: "EVIDENCE_SHAPE",   // never the truth of the claim
  });
}

module.exports = { gradeCausal, LEVELS };
