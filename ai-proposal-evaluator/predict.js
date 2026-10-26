"use strict";

const crypto = require("node:crypto");
const { createLadder, deepFreeze, isAnswered, unreadable } = require("./severity.js");

/**
 * Gate 16 — pre-registered prediction.
 *
 * The other gates ask whether a system may act or may believe. This one asks
 * the only question that can settle a theory: did the number you stated
 * BEFORE looking match the number the world returned?
 *
 * A theory is not tested by how much has been written about it, how many
 * systems have read it, or how confident its author is. Gate 15 already
 * showed what confidence does when it is counted twice. This gate closes the
 * other door: grading your own homework after seeing the answer.
 *
 * The rule: a prediction is sealed with its hash before observation. Scoring
 * requires a tolerance that was fixed at prediction time, not chosen once the
 * error is known. A prediction registered after the observation was available
 * is marked retrospective and can never count as a hit — it may still be
 * recorded, because hiding it would be the same defect in a different coat.
 */

const sha256 = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");

/**
 * Seal a prediction. Everything the scorer will need is fixed here, including
 * the tolerance — chosen while the answer is still unknown.
 *
 *   id         a name you will recognise later
 *   quantity   what is being predicted, in words
 *   value      the number
 *   unit       its unit, stated, because a number without one is not a claim
 *   tolerance  relative, e.g. 0.01 for "within 1%"
 *   method     how it was derived — a formula, a model, a guess, say which
 *   observedAvailable  true if the measured value could already be looked up
 */
function predict(p) {
  const ladder = createLadder();
  const reasons = [];

  const need = ["id", "quantity", "value", "unit", "tolerance", "method"];
  for (const k of need) {
    if (p[k] === undefined || p[k] === null || p[k] === "") {
      ladder.raise("HOLD");
      reasons.push(`Gate 16 Block: "${k}" is missing; an incomplete prediction cannot be scored.`);
    }
  }
  if (typeof p.value !== "number" || !Number.isFinite(p.value)) {
    ladder.raise("HOLD");
    reasons.push("Gate 16 Block: value must be a finite number.");
  }
  if (typeof p.tolerance !== "number" || !(p.tolerance > 0) || p.tolerance >= 1) {
    ladder.raise("HOLD");
    reasons.push("Gate 16 Block: tolerance must be a relative fraction in (0,1), fixed now.");
  }

  // ⚠️ FIX 2026-10-10. Below stood `=== true`, and the missing-value check
  // looked only at `undefined`. So `observedAvailable: "yes"` was neither:
  // it did not count as "yes", it did not count as missing — and silently
  // became "no".
  //
  // That is, a prediction made WHEN THE ANSWER WAS ALREADY KNOWN could be
  // sealed as genuine if the answer was written as text.
  //
  // The file carries the rule in its own message two lines below:
  // "Unanswered is not an answer of no." It applies here too.
  if (p.observedAvailable !== undefined && !isAnswered(p.observedAvailable)) {
    ladder.raise("HOLD");
    reasons.push(
      "Gate 16 Block: observedAvailable must be true or false — " +
        `${unreadable(p.observedAvailable, "true or false")}. ` +
        "An unreadable answer is not an answer of no."
    );
  }

  const retrospective = p.observedAvailable === true;
  if (retrospective) {
    reasons.push(
      "Gate 16 Note: the measured value was already available. Recorded as " +
        "retrospective — it can never count as a hit."
    );
  }
  if (p.observedAvailable === undefined) {
    ladder.raise("HOLD");
    reasons.push(
      "Gate 16 Block: state whether the measured value was already available. " +
        "Unanswered is not an answer of no."
    );
  }

  const sealedAt = p.sealedAt || new Date().toISOString();
  const body = [p.id, p.quantity, p.value, p.unit, p.tolerance, p.method, sealedAt, retrospective].join("␟");

  return deepFreeze({
    decision: ladder.current(),
    reasons,
    id: p.id,
    quantity: p.quantity,
    value: p.value,
    unit: p.unit,
    tolerance: p.tolerance,
    method: p.method,
    retrospective,
    sealedAt,
    seal: ladder.current() === "CLEAR" ? sha256(body) : null,
  });
}

/**
 * One line per prediction, ready to hash and timestamp. Stamp this before the
 * answer is looked up and the order of events stops being a matter of trust.
 */
function manifest(predictions) {
  const lines = predictions
    .filter((p) => p.seal)
    .map((p) => `${p.seal}  ${p.id}  ${p.value} ${p.unit}  ±${p.tolerance * 100}%`)
    .sort();
  const text = lines.join("\n") + "\n";
  return deepFreeze({ text, sha256: sha256(text), count: lines.length });
}

/** Score a sealed prediction against a measurement. The seal is re-checked. */
function score(prediction, observed) {
  const ladder = createLadder();
  const reasons = [];

  if (!prediction || prediction.decision !== "CLEAR" || !prediction.seal) {
    ladder.raise("HOLD");
    reasons.push("Gate 16 Block: prediction was never sealed; nothing to score.");
    // Defect #9: this was hit: false. The module carries its own rule —
    // "Unanswered is not an answer of no" — and broke it here: a missing
    // answer was read as a miss. null means "no answer".
    return deepFreeze({ decision: ladder.current(), reasons, hit: null });
  }
  if (typeof observed !== "number" || !Number.isFinite(observed)) {
    ladder.raise("HOLD");
    reasons.push("Gate 16 Block: observed value must be a finite number.");
    return deepFreeze({ decision: ladder.current(), reasons, hit: null, id: prediction.id });
  }

  const expected = sha256(
    [prediction.id, prediction.quantity, prediction.value, prediction.unit,
     prediction.tolerance, prediction.method, prediction.sealedAt,
     prediction.retrospective].join("␟")
  );
  if (expected !== prediction.seal) {
    ladder.raise("STOP");
    reasons.push("Gate 16 Block: the prediction was altered after sealing.");
    return deepFreeze({ decision: ladder.current(), reasons, hit: null, id: prediction.id });
  }

  const absError = Math.abs(prediction.value - observed);
  const relError = observed === 0 ? (absError === 0 ? 0 : Infinity) : absError / Math.abs(observed);
  const within = relError <= prediction.tolerance;
  const hit = within && !prediction.retrospective;

  if (prediction.retrospective && within) {
    reasons.push(
      "Gate 16 Note: within tolerance, but retrospective. Not counted as a hit."
    );
  }

  return deepFreeze({
    decision: ladder.current(),
    reasons,
    id: prediction.id,
    predicted: prediction.value,
    observed,
    unit: prediction.unit,
    absError,
    relError,
    tolerance: prediction.tolerance,
    withinTolerance: within,
    retrospective: prediction.retrospective,
    hit,
  });
}

/**
 * The tally. It reports what was predicted in advance and what was not,
 * separately, because mixing them is how a record flatters itself.
 */
function report(scored) {
  const usable = scored.filter((s) => s.decision === "CLEAR" && typeof s.relError === "number");
  const ahead = usable.filter((s) => !s.retrospective);
  const behind = usable.filter((s) => s.retrospective);
  // === true, not merely truthy: null now means "unanswered" and must fall
  // neither among the hits nor into the shared denominator below.
  const hits = ahead.filter((s) => s.hit === true);

  const mean = (xs) =>
    xs.length ? xs.reduce((a, s) => a + s.relError, 0) / xs.length : null;

  return deepFreeze({
    predictedInAdvance: ahead.length,
    hits: hits.length,
    hitRate: ahead.length ? hits.length / ahead.length : null,
    meanRelError: mean(ahead),
    retrospective: behind.length,
    retrospectiveMeanRelError: mean(behind),
    worst: usable.length
      ? usable.reduce((w, s) => (s.relError > w.relError ? s : w)).id
      : null,
    note:
      ahead.length === 0
        ? "Nothing was predicted in advance. This record says nothing about the method."
        : `${hits.length} of ${ahead.length} sealed before observation.`,
  });
}

module.exports = { predict, manifest, score, report };
