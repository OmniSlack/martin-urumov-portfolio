"use strict";

const { createLadder, deepFreeze, isAnswered, isNonEmptyText, unreadable } = require("./severity.js");

/**
 * Balancing Assessment for Legitimate Interest — GDPR Art. 6(1)(f).
 *
 * Structured after the Data Protection Network assessment template, in the
 * form used by the supplied Exponential publisher assessment:
 *
 *   2.1 Identifying a Legitimate Interest
 *   2.2 The Necessity Test
 *   2.3 The Balancing Test
 *   2.4 Safeguards and Compensating Controls
 *   2.5 Reaching a Decision and Document the Outcome
 *
 * It runs on the same ladder as the Core (STOP > HOLD > CLEAR) and under the
 * same fail-closed rule as Gate 04: an unanswered question is not an answer of
 * "no". A blank in the balancing test holds the assessment; it never clears it.
 *
 * This is not legal advice and does not replace one. It checks whether an
 * assessment is *complete and internally sound enough to be relied on* — not
 * whether a regulator would agree with its conclusions.
 */

// Questions from 2.3 whose absence blocks the assessment. Answering them is
// what the balancing test *is*; leaving one blank means it was not performed.
const REQUIRED_BALANCING = [
  "expectedByIndividual",
  "addsValueToIndividual",
  "unwarrantedHarm",
  "underminesRights",
  "inIndividualsInterest",
  "specialCategory",
  "fairProcessingNotice",
  "easyObjection",
];

const unanswered = (v) => v === undefined || v === null || v === "";

function assess(record, options = {}) {
  const ladder = createLadder();
  const reasons = [];
  const now = options.now ? new Date(options.now) : new Date();

  const r = record || {};
  const purpose = r.purpose || {};
  const necessity = r.necessity || {};
  const balancing = r.balancing || {};
  const safeguards = r.safeguards || {};
  const outcome = r.outcome || {};

  // --- 2.1 Identifying a Legitimate Interest -------------------------------
  // No identified interest means there is nothing to balance. This is not a
  // gap to be filled later; the basis does not exist.
  if (unanswered(purpose.description)) {
    ladder.raise("STOP");
    reasons.push("2.1 Block: No legitimate interest identified; Art. 6(1)(f) cannot be relied on.");
  }
  if (unanswered(purpose.controllerObjective) && unanswered(purpose.thirdPartyObjective)) {
    ladder.raise("HOLD");
    reasons.push("2.1 Hold: Neither a controller nor a third-party objective is stated.");
  }

  // --- 2.2 The Necessity Test ---------------------------------------------
  if (unanswered(necessity.alternativeExists)) {
    ladder.raise("HOLD");
    reasons.push("2.2 Hold: The 'is there another way' question is unanswered.");
  } else if (necessity.alternativeExists === true) {
    ladder.raise("HOLD");
    reasons.push("2.2 Hold: A less intrusive way of achieving the objective exists; processing is not necessary.");
  }
  if (unanswered(necessity.importantToController)) {
    ladder.raise("HOLD");
    reasons.push("2.2 Hold: Importance of the processing to the controller is not stated.");
  }

  // --- 2.3 The Balancing Test ---------------------------------------------
  const blanks = REQUIRED_BALANCING.filter((k) => unanswered(balancing[k]));
  if (blanks.length > 0) {
    ladder.raise("HOLD");
    reasons.push(`2.3 Hold: Balancing test incomplete; unanswered: ${blanks.join(", ")}.`);
  }

  // ⚠️ FIX 2026-10-10. Until then every check below compared with `true`
  // or `false` by name. So `unwarrantedHarm: "yes"` was neither — it raised
  // nothing and the record came out CLEAR. Measured:
  //
  //     unwarrantedHarm = "yes"   →  CLEAR     (a real true → STOP)
  //     underminesRights = "yes"  →  CLEAR
  //     specialCategory  = "yes"  →  CLEAR
  //
  // A string is not a boolean answer. It is an unanswered question dressed
  // as an answer — and the only honest result is HOLD, not STOP and not CLEAR.
  const unreadableFields = REQUIRED_BALANCING
    .filter((k) => !unanswered(balancing[k]) && !isAnswered(balancing[k]))
    .map((k) => `${k} (${unreadable(balancing[k], "true or false")})`);
  if (unreadableFields.length > 0) {
    ladder.raise("HOLD");
    reasons.push(`2.3 Hold: Unreadable answer, neither true nor false: ${unreadableFields.join("; ")}.`);
  }

  if (balancing.unwarrantedHarm === true) {
    ladder.raise("STOP");
    reasons.push("2.3 Block: Processing is likely to cause unwarranted harm or distress.");
  }
  if (balancing.underminesRights === true) {
    ladder.raise("STOP");
    reasons.push("2.3 Block: Processing would limit or undermine the rights of individuals.");
  }
  if (balancing.specialCategory === true && unanswered(balancing.article9Condition)) {
    ladder.raise("STOP");
    reasons.push("2.3 Block: Special category data without a separate Art. 9 condition.");
  }
  if (balancing.expectedByIndividual === false) {
    ladder.raise("HOLD");
    reasons.push("2.3 Hold: The individual would not expect this processing.");
  }
  if (balancing.fairProcessingNotice === false) {
    ladder.raise("HOLD");
    reasons.push("2.3 Hold: No fair processing notice is provided to the individual.");
  }
  if (balancing.easyObjection === false) {
    ladder.raise("HOLD");
    reasons.push("2.3 Hold: The individual cannot easily object to or control the processing.");
  }

  // --- 2.4 Safeguards and Compensating Controls ---------------------------
  const controls = Array.isArray(safeguards.controls) ? safeguards.controls : [];
  if (controls.length === 0) {
    ladder.raise("HOLD");
    reasons.push("2.4 Hold: No safeguards or compensating controls are recorded.");
  }

  // ⚠️ FIX 2026-10-10. The LENGTH of the list was counted, not its content.
  // Measured: `controls: [""]` gave CLEAR — one blank line passed as a
  // safeguard. This is "looks like a safeguard" from the defect register:
  // the shape of a barrier without its content.
  //
  // ⚪ What this STILL does not measure: `controls: [""]` now fails, but
  // `controls: ["something"]` passes. The TYPE is guarded, not the meaning.
  // Whether a measure is a real safeguard, this file does not read and does
  // not pretend to.
  const blank = controls.filter((c) => !isNonEmptyText(c)).length;
  if (controls.length > 0 && blank > 0) {
    ladder.raise("HOLD");
    reasons.push(`2.4 Hold: ${blank} of ${controls.length} recorded safeguards are blank; a blank line is not a control.`);
  }
  const retention = safeguards.retention;
  if (!retention || Object.keys(retention).length === 0) {
    ladder.raise("HOLD");
    reasons.push("2.4 Hold: No retention limits are recorded.");
  }

  // --- 2.5 Reaching a Decision and Document the Outcome -------------------
  if (unanswered(outcome.conclusion)) {
    ladder.raise("HOLD");
    reasons.push("2.5 Hold: No documented outcome.");
  }
  if (unanswered(outcome.signedBy)) {
    ladder.raise("HOLD");
    reasons.push("2.5 Hold: The assessment is unsigned.");
  }

  // Mirrors Gate 09 (temporal conflict): an assessment past its own review
  // date is a stale assessment, and a review date that is not a determinate
  // date cannot be shown to be in the future.
  if (unanswered(outcome.reviewDate)) {
    ladder.raise("HOLD");
    reasons.push("2.5 Hold: No review date is set.");
  } else {
    const review = new Date(outcome.reviewDate);
    if (Number.isNaN(review.getTime())) {
      ladder.raise("HOLD");
      reasons.push(`2.5 Hold: Review date "${outcome.reviewDate}" is not a determinate date.`);
    } else if (review.getTime() < now.getTime()) {
      ladder.raise("HOLD");
      reasons.push(`2.5 Hold: Review date ${outcome.reviewDate} has passed; the assessment is stale.`);
    }
  }

  const sectionState = (blocked) => (blocked ? "INCOMPLETE" : "COMPLETE");
  const has = (prefix) => reasons.some((x) => x.startsWith(prefix));

  return deepFreeze({
    decision: ladder.current(),
    reasons,
    sections: {
      "2.1 purpose": sectionState(has("2.1")),
      "2.2 necessity": sectionState(has("2.2")),
      "2.3 balancing": sectionState(has("2.3")),
      "2.4 safeguards": sectionState(has("2.4")),
      "2.5 outcome": sectionState(has("2.5")),
    },
    assessedAt: now.toISOString(),
  });
}

module.exports = { assess, REQUIRED_BALANCING };
