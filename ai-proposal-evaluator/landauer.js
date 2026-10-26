"use strict";

const { createLadder, deepFreeze } = require("./severity.js");

/**
 * H_info — the information term, with units.
 *
 * The three-symbol form `H = H_physics + H_mind + H_info` cannot be summed:
 * energy is in joules, information is in bits, and bits are dimensionless.
 * A sum needs a conversion with units of J/bit.
 *
 * Exactly one such conversion is established physics: Landauer's principle.
 * Erasing one bit of information in a thermal bath at temperature T costs at
 * least
 *
 *     E = k_B · T · ln2        joules per bit
 *
 * This module is that term and nothing more. It takes a number of bits and a
 * temperature and returns joules. It refuses to return a number when either is
 * missing, because a term without units is not a term.
 *
 * ⚠ FOUR BOUNDARIES, stated here rather than discovered later:
 *
 *   1. The bound is on ERASURE, not on computation. Logically reversible
 *      operations have no such floor. Counting every operation as an erasure
 *      overstates the cost, often by a lot.
 *
 *   2. It is a LOWER BOUND, not a prediction of what anything actually costs.
 *      Real hardware runs orders of magnitude above it. A measured cost below
 *      it would falsify the principle; a cost above it proves nothing.
 *
 *   3. It requires a TEMPERATURE. There is no universal bit↔joule exchange
 *      rate, only a rate at a given T. So H_info is thermodynamic: it exists
 *      where there is a bath, not as a free-standing term of the universe.
 *
 *   4. It says NOTHING about mind, meaning, or content. A bit of a sonnet and
 *      a bit of noise cost exactly the same to erase. Any use of this term to
 *      price thought is using it for something it does not measure.
 *
 * k_B is exact by the 2019 SI definition — a defined constant, not a measured
 * one, so the only uncertainty in the result comes from N and T.
 */

const K_B = 1.380649e-23;          // J/K, exact by definition (SI 2019)
const LN2 = Math.LN2;
const ROOM_K = 300;                // a conventional reference, not a constant
const CMB_K = 2.72548;             // cosmic microwave background, measured

/**
 * Joules to erase one bit at temperature T. The whole conversion.
 *
 * Defect #6, found by probe Q1/Q2: this multiplied without looking at what it
 * was multiplying. joulesPerBit(0) returned 0 — erasing a bit for free — and
 * joulesPerBit(-300) returned a negative energy. Neither temperature exists:
 * absolute zero is unreachable by the third law, and there is no negative
 * absolute temperature on this scale.
 *
 * The rule was already written four lines below, in a comment on hInfo:
 * "kelvin  absolute temperature of the bath; must be > 0". It lived in a
 * sentence and in nothing else, which is defect #3 committed again inside the
 * module written to close it. It is now a condition.
 */
function joulesPerBit(kelvin) {
  if (typeof kelvin !== "number" || !Number.isFinite(kelvin)) {
    throw new TypeError(
      "Landauer: temperature must be a finite number of kelvin."
    );
  }
  if (kelvin <= 0) {
    throw new RangeError(
      `Landauer: ${kelvin} K is not a temperature. The bound is defined for ` +
        "T > 0; absolute zero is unreachable and there is no negative " +
        "absolute temperature. Erasure is never free."
    );
  }
  return K_B * kelvin * LN2;
}

/**
 * H_info for N bits erased at temperature T.
 *
 *   bits    a count; may be fractional (a partial erasure is meaningful)
 *   kelvin  absolute temperature of the bath; must be > 0
 */
function hInfo(bits, kelvin) {
  const ladder = createLadder();
  const reasons = [];

  if (typeof bits !== "number" || !Number.isFinite(bits) || bits < 0) {
    ladder.raise("HOLD");
    reasons.push("H_info Block: bits must be a finite count of zero or more.");
  }
  if (typeof kelvin !== "number" || !Number.isFinite(kelvin) || kelvin <= 0) {
    ladder.raise("HOLD");
    reasons.push(
      "H_info Block: temperature must be above absolute zero. " +
        "Without a bath there is no bit-to-joule rate, so there is no term."
    );
  }
  if (ladder.current() !== "CLEAR") {
    return deepFreeze({ decision: ladder.current(), reasons, joules: null, unit: "J" });
  }

  const perBit = joulesPerBit(kelvin);
  return deepFreeze({
    decision: "CLEAR",
    reasons,
    bits,
    kelvin,
    joulesPerBit: perBit,
    joules: bits * perBit,
    unit: "J",
    bound: "LOWER",          // never an estimate of actual cost
    appliesTo: "ERASURE",    // never to reversible operations
  });
}

/** How many bits one joule could erase at T. The same fact, inverted. */
function bitsPerJoule(kelvin) {
  const h = hInfo(1, kelvin);
  return h.decision === "CLEAR" ? 1 / h.joulesPerBit : null;
}

/**
 * How far a measured cost sits above the floor.
 *
 * Returns the ratio and, when it is below 1, says so plainly: a measurement
 * below the Landauer bound does not mean efficiency, it means the principle
 * or the measurement is wrong. That is the falsifiable edge of this term.
 */
function againstFloor(bits, kelvin, measuredJoules) {
  const h = hInfo(bits, kelvin);
  if (h.decision !== "CLEAR") return h;
  if (typeof measuredJoules !== "number" || !Number.isFinite(measuredJoules) || measuredJoules < 0) {
    return deepFreeze({
      decision: "HOLD",
      reasons: ["H_info Block: measured energy must be a finite non-negative number of joules."],
      ratio: null,
    });
  }

  const ratio = measuredJoules / h.joules;
  const below = ratio < 1;
  return deepFreeze({
    decision: below ? "STOP" : "CLEAR",
    reasons: below
      ? [
          `H_info Block: measured ${measuredJoules.toExponential(3)} J is below the ` +
            `floor of ${h.joules.toExponential(3)} J. Either the measurement is wrong ` +
            "or Landauer's principle is. Both are worth knowing; neither is efficiency.",
        ]
      : [],
    bits,
    kelvin,
    floorJoules: h.joules,
    measuredJoules,
    ratio,
    unit: "J",
  });
}

module.exports = { hInfo, joulesPerBit, bitsPerJoule, againstFloor, K_B, ROOM_K, CMB_K };
