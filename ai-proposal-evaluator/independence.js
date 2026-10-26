"use strict";

const { createLadder, deepFreeze, isFiniteNumber, unreadable } = require("./severity.js");

/**
 * Gate 15 — evidence independence.
 *
 * The other gates guard what the system may DO. This one guards what the
 * system may BELIEVE, which until now nothing did.
 *
 * The failure it exists for: one source, counted more than once, raises
 * confidence without adding information. Measured, not asserted — a single
 * source at 75% counted as three independent sources reads as 96.43%. The
 * 21.43 points in between were produced by the counting, not by the world.
 *
 * The rule is therefore not "prefer independent evidence". It is: evidence
 * that shares a root is collapsed to that root before anything is combined,
 * and a claim that was already combined as if independent is refused.
 *
 * Repetition is not independent corroboration.
 */

/** Odds form: p / (1 - p). Combining independent evidence multiplies odds. */
const toOdds = (p) => p / (1 - p);
const fromOdds = (o) => o / (1 + o);

/**
 * Follow `derivedFrom` to the item that nothing else derives from.
 * Returns the root id, or a marker for a broken or circular chain.
 */
function rootOf(id, byId) {
  const seen = new Set();
  let current = id;
  while (true) {
    if (seen.has(current)) return { root: null, fault: "CYCLE", at: current };
    seen.add(current);
    const item = byId.get(current);
    if (!item) return { root: null, fault: "DANGLING", at: current };
    if (!item.derivedFrom) return { root: current, fault: null, at: null };
    current = item.derivedFrom;
  }
}

/**
 * Assess a body of evidence.
 *
 * Each item: { id, source, confidence, derivedFrom? }
 *   derivedFrom — the id this item came from. A restatement, a copy, a
 *   summary, or a model's own earlier output all derive from their origin.
 *
 * `claimedConfidence` is optional: the number already being asserted
 * somewhere else. If it is higher than the honest one, the gate says by
 * how much and holds.
 */
function assessIndependence(evidence, claimedConfidence = null) {
  const ladder = createLadder();
  const reasons = [];

  if (!Array.isArray(evidence) || evidence.length === 0) {
    ladder.raise("HOLD");
    reasons.push("Gate 15 Block: No evidence supplied; absence is not support.");
    return deepFreeze({
      decision: ladder.current(),
      reasons,
      honestConfidence: null,
      claimedConfidence,
      inflationPoints: null,
      roots: [],
      timestamp: new Date().toISOString(),
    });
  }

  const byId = new Map();
  for (const item of evidence) {
    if (!item || typeof item.id !== "string") {
      ladder.raise("HOLD");
      reasons.push("Gate 15 Block: Evidence item without an id cannot be traced.");
      continue;
    }
    if (byId.has(item.id)) {
      ladder.raise("HOLD");
      reasons.push(`Gate 15 Block: Duplicate evidence id "${item.id}".`);
      continue;
    }
    byId.set(item.id, item);
  }

  // Group by root. Within a root, repetition adds nothing: the strongest
  // single statement of a source is what that source is worth.
  const byRoot = new Map();
  for (const item of byId.values()) {
    if (!item.source || item.source === "UNKNOWN") {
      ladder.raise("HOLD");
      reasons.push(`Gate 15 Block: Evidence "${item.id}" has unknown provenance; fail-closed.`);
      continue;
    }
    // ⚠️ FIX 2026-10-10. This line was `typeof item.confidence !== "number"`
    // and it let `NaN` through — because `typeof NaN === "number"`, while
    // `NaN <= 0` and `NaN >= 1` are BOTH false. The unknown value passed all
    // three conditions at once.
    //
    // Measured before the fix:
    //     confidence: NaN  →  CLEAR, honestConfidence: NaN
    //
    // A decision computed from NaN is not a weak decision. It is a
    // non-decision dressed in green.
    if (!isFiniteNumber(item.confidence) || item.confidence <= 0 || item.confidence >= 1) {
      ladder.raise("HOLD");
      reasons.push(
        `Gate 15 Block: Evidence "${item.id}" has no usable confidence in (0,1) — ` +
        `${unreadable(item.confidence, "a finite number in (0,1)")}.`);
      continue;
    }

    const { root, fault, at } = rootOf(item.id, byId);
    if (fault === "CYCLE") {
      ladder.raise("HOLD");
      reasons.push(
        `Gate 15 Block: Evidence "${item.id}" derives from itself through "${at}". ` +
          "A claim cannot be its own support."
      );
      continue;
    }
    if (fault === "DANGLING") {
      ladder.raise("HOLD");
      reasons.push(
        `Gate 15 Block: Evidence "${item.id}" derives from "${at}", which is not present. ` +
          "An untraceable origin is not a second source."
      );
      continue;
    }

    const prev = byRoot.get(root);
    if (prev === undefined || item.confidence > prev) byRoot.set(root, item.confidence);
  }

  if (byRoot.size === 0) {
    return deepFreeze({
      decision: ladder.current() === "CLEAR" ? "HOLD" : ladder.current(),
      reasons: reasons.length ? reasons : ["Gate 15 Block: Nothing usable remained."],
      honestConfidence: null,
      claimedConfidence,
      inflationPoints: null,
      roots: [],
      timestamp: new Date().toISOString(),
    });
  }

  // Combine across distinct roots only.
  let odds = 1;
  for (const c of byRoot.values()) odds *= toOdds(c);
  const honestConfidence = fromOdds(odds);

  // What the same evidence would read as if every item were counted as
  // independent — the number this gate exists to refuse.
  let naiveOdds = 1;
  for (const item of byId.values()) {
    // The same hole, second place: `typeof` also let NaN into the naive
    // product. Fixed with the shared guard.
    if (isFiniteNumber(item.confidence) && item.confidence > 0 && item.confidence < 1) {
      naiveOdds *= toOdds(item.confidence);
    }
  }
  const naiveConfidence = fromOdds(naiveOdds);
  const collapsed = byId.size - byRoot.size;

  if (collapsed > 0) {
    reasons.push(
      `Gate 15 Note: ${byId.size} items collapse to ${byRoot.size} independent ` +
        `${byRoot.size === 1 ? "source" : "sources"}. Counted as independent they would read ` +
        `${(naiveConfidence * 100).toFixed(2)}%; they are worth ${(honestConfidence * 100).toFixed(2)}%.`
    );
  }

  let inflationPoints = null;
  if (typeof claimedConfidence === "number") {
    inflationPoints = (claimedConfidence - honestConfidence) * 100;
    if (inflationPoints > 0.005) {
      ladder.raise("HOLD");
      reasons.push(
        `Gate 15 Block: Claimed ${(claimedConfidence * 100).toFixed(2)}% against an honest ` +
          `${(honestConfidence * 100).toFixed(2)}%. Inflation ${inflationPoints.toFixed(2)} points, ` +
          "produced by the counting rather than by the evidence."
      );
    }
  }

  return deepFreeze({
    decision: ladder.current(),
    reasons,
    honestConfidence,
    claimedConfidence,
    inflationPoints,
    roots: [...byRoot.keys()].sort(),
    timestamp: new Date().toISOString(),
  });
}

module.exports = { assessIndependence };
