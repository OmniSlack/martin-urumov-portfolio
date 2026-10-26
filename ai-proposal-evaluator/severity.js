"use strict";

/**
 * Shared primitives for the evaluators.
 *
 * Extracted in v0.4 so that the Core, the Observer and the balancing
 * assessment all run on one severity ladder and one freeze routine, rather
 * than three drifting copies.
 */

const ORDER = { CLEAR: 0, HOLD: 1, STOP: 2 };

/**
 * Severity ladder: STOP > HOLD > CLEAR. STOP is terminal — once raised,
 * no later call can demote it.
 */
function createLadder() {
  let decision = "CLEAR";
  return {
    raise(next) {
      if (decision === "STOP") return;
      if (!(next in ORDER)) return;
      if (ORDER[next] > ORDER[decision]) decision = next;
    },
    current() {
      return decision;
    },
  };
}

function deepFreeze(obj) {
  Object.keys(obj).forEach((name) => {
    const prop = obj[name];
    if (typeof prop === "object" && prop !== null) deepFreeze(prop);
  });
  return Object.freeze(obj);
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * TYPE GUARDS — added 2026-10-10 on Martin Urumov's instruction:
 * "fix the five modules to return HOLD on an unknown type".
 *
 * THE CAUSE, measured rather than read. Five modules returned CLEAR on input
 * they could not read:
 *
 *     balancing     unwarrantedHarm = "yes"  (string)  →  CLEAR
 *     balancing     safeguards = [""]                  →  CLEAR
 *     independence  confidence = NaN                   →  CLEAR
 *
 * WHY HOLD AND NOT STOP. The string "yes" is not `true`. It is AN UNANSWERED
 * QUESTION dressed as an answer — it may mean yes, it may have been pasted
 * from a form, it may be a typo.
 *
 *   STOP  would assume it means "yes"  — filling in what is missing
 *   CLEAR would assume it means "no"   — the same, in the other direction
 *   HOLD  is the only honest result: this cannot be read, a human decides
 *
 * The rule is not new. `predict.js` states it for itself:
 * "Unanswered is not an answer of no." `core.js` applies it in Gate 18.
 * The five modules had written it down and not enforced it.
 *
 * ⚠️ THE BOUNDARY: this guards the TYPE, not the content. `mechanism: "magic"`
 * is non-empty text and passes. The guard does not read meaning and does not
 * pretend to.
 * ═══════════════════════════════════════════════════════════════════════
 */

/**
 * A real boolean answer — and nothing else.
 * `"yes"`, `"true"`, `1`, `"no"` and `null` are NOT answers.
 */
const isAnswered = (v) => v === true || v === false;

/** A finite number. `NaN` and `Infinity` are not numbers to decide on. */
const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);

/** Non-empty text. `""` and `"   "` are not content. */
const isNonEmptyText = (v) => typeof v === "string" && v.trim().length > 0;

/**
 * Why exactly this input cannot be read — a sentence for the `reasons` field.
 * Returns `null` when the value IS usable; otherwise says WHAT arrived, so
 * nobody has to guess.
 */
function unreadable(value, expected) {
  const kind = value === null ? "null"
    : Array.isArray(value) ? "array"
    : Number.isNaN(value) ? "NaN"
    : typeof value;
  const shown = typeof value === "string" ? `"${value}"` : String(value);
  return `received ${kind} ${shown}, expected ${expected}`;
}

module.exports = {
  createLadder, deepFreeze,
  isAnswered, isFiniteNumber, isNonEmptyText, unreadable,
};
