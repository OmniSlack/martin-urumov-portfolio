"use strict";

const crypto = require("node:crypto");
const { deepFreeze } = require("./severity.js");

/**
 * THE REACTION GAP.
 *
 * A layer that sits above the evaluator. Per the map:
 *
 *     THE OBSERVER · A LAYER ABOVE THE SYSTEM
 *       synchronises · sees the reaction and itself · does not correct
 *     STIMULUS — something enters
 *
 * Those three properties are implemented as checkable facts, not as labels:
 *
 *   synchronises          the gap is timed on the same clock the reaction
 *                         stamps itself with, so opened <= timestamp <= closed
 *   sees the reaction     the reaction is recorded as returned — the same
 *   and itself            object, by identity — and the record carries a seal
 *                         over what the Observer itself did
 *   does not correct      the Observer has no write path to the reaction. It
 *                         does not decide, does not re-run gates, does not
 *                         alter the decision, and does not freeze it either.
 *                         Removing the Observer from a call chain changes
 *                         nothing about the outcome or the object.
 *
 * v0.8 closes the project's own defect #1. Until now `self` was three literals:
 *
 *     self: { sawReaction: true, sawItself: true, corrected: false }
 *
 * A file whose purpose is to see itself was asserting that it did. Every field
 * below is now derived from what actually happened in this call.
 *
 * ⚠ THE NARROWING, stated rather than hidden: "sees itself" is not proven here
 * in the strong sense. What is implemented is narrower — the Observer records
 * its own act in a form anyone can verify, via `verifyObservation`. That claim
 * is smaller than the old one, and unlike the old one it can be refuted.
 *
 * Scope: this implements the core chain only — Observer → Stimulus → Gap →
 * Reaction. The source map's further sections (brackets and axes, capacity,
 * levels) are not implemented here; see README.
 */

const LADDER = new Set(["STOP", "HOLD", "CLEAR"]);
const UNIT = "␟";

const sha256 = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");

/** A reaction is an object carrying a decision from the ladder. Nothing else is. */
function isReaction(x) {
  return !!x && typeof x === "object" && LADDER.has(x.decision);
}

/**
 * Fingerprint of a reaction, stable under key order. Used to detect any change
 * to the observed object between seeing it and recording it.
 */
function digestOf(reaction) {
  if (!isReaction(reaction)) return null;
  const stable = (v) => {
    if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
    if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
    return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
  };
  return sha256(stable(reaction));
}

/** The bytes the seal is taken over: what the Observer did, not what it decided. */
function sealBody(rec) {
  return [
    rec.layer,
    rec.stimulus.label,
    rec.stimulus.entered,
    rec.gap.opened,
    rec.gap.closed,
    rec.gap.gatesFired,
    rec.gap.synchronised,
    rec.self.observation,
    rec.self.sawReaction,
    rec.self.correctionChecked,
    rec.self.reactionDigest,
  ].join(UNIT);
}

class Observer {
  constructor() {
    this.layer = "OBSERVER";
    // The Observer's own count of what it has done. Measured, not declared.
    this.observations = 0;
  }

  /**
   * @param {string|object} stimulus  what entered ("something enters")
   * @param {function} react          produces the reaction; normally
   *                                  () => core.evaluate(proposal, context)
   */
  observe(stimulus, react) {
    if (typeof react !== "function") {
      throw new TypeError("Observer.observe requires a reaction function.");
    }

    const label = typeof stimulus === "string" ? stimulus : (stimulus && stimulus.label) || "UNLABELLED";
    const opened = new Date().toISOString();
    const observation = ++this.observations;

    // The gap: the interval between stimulus and reaction, in which the gates
    // run. The Observer holds it open and does not enter it.
    const reaction = react();

    const closed = new Date().toISOString();

    // What was seen, fingerprinted at the moment of seeing.
    const sawReaction = isReaction(reaction);
    const reactionDigest = digestOf(reaction);

    const synchronised =
      sawReaction &&
      typeof reaction.timestamp === "string" &&
      reaction.timestamp >= opened &&
      reaction.timestamp <= closed;

    const record = {
      layer: this.layer,
      stimulus: { label, entered: opened },
      gap: {
        opened,
        closed,
        gatesFired: sawReaction && Array.isArray(reaction.reasons) ? reaction.reasons.length : 0,
        synchronised,
      },
      // The reaction as returned. Same object, not a copy — a copy would be a
      // second version of the truth, and the Observer is not entitled to one.
      reaction,
      self: {
        observation,
        sawReaction,
        reactionDigest,
        // Did the comparison below actually run? Without this, `corrected:
        // false` would mean two different things — "checked, and it was
        // unchanged" and "there was nothing to check" — and the reader would
        // have to infer which from another field. A record that needs
        // inference to be read is the defect this file exists to avoid.
        correctionChecked: sawReaction,
        // Filled in below, against the object as it sits in the record rather
        // than against the local variable — comparing a variable to itself
        // would read like a check and be none.
        corrected: false,
        sawItself: false,
        seal: null,
      },
    };

    // Is the reaction in the record still the same object, with the same
    // content, as the one that came back from react()? Any future change that
    // copies or mutates it flips this from false to true. Only meaningful
    // when correctionChecked is true.
    record.self.corrected =
      sawReaction && (record.reaction !== reaction || digestOf(record.reaction) !== reactionDigest);

    // The Observer seals its own act. This is the narrowed, checkable form of
    // "sees itself": not an assertion, a hash anyone can recompute.
    record.self.seal = sha256(sealBody(record));
    record.self.sawItself = typeof record.self.seal === "string" && record.self.seal.length === 64;

    // Freeze only what the Observer owns. The reaction is deliberately left
    // untouched: making someone else's object immutable is still changing it.
    Object.freeze(record.stimulus);
    Object.freeze(record.gap);
    Object.freeze(record.self);
    return Object.freeze(record);
  }
}

/**
 * Recompute the record's own claims from the record itself.
 *
 * This is what makes the Observer's self-record worth anything: it is not
 * trusted, it is checked. Returns the first failure by name rather than a bare
 * false, because "invalid" without a reason is the same defect one level up.
 */
function verifyObservation(record) {
  if (!record || typeof record !== "object") {
    return { valid: false, reason: "NOT_A_RECORD" };
  }
  if (!record.self || typeof record.self !== "object") {
    return { valid: false, reason: "NO_SELF_RECORD" };
  }
  if (typeof record.self.seal !== "string" || record.self.seal.length !== 64) {
    return { valid: false, reason: "NO_SEAL" };
  }
  if (!record.stimulus || !record.gap) {
    return { valid: false, reason: "INCOMPLETE_RECORD" };
  }

  if (record.self.correctionChecked !== record.self.sawReaction) {
    return { valid: false, reason: "CHECK_FLAG_DOES_NOT_MATCH_WHAT_WAS_SEEN" };
  }

  if (record.self.sawReaction) {
    const now = digestOf(record.reaction);
    if (now === null) {
      return { valid: false, reason: "REACTION_MISSING_OR_NOT_A_REACTION" };
    }
    if (now !== record.self.reactionDigest) {
      return { valid: false, reason: "REACTION_CHANGED_SINCE_OBSERVED" };
    }
  } else if (record.self.reactionDigest !== null) {
    return { valid: false, reason: "DIGEST_WITHOUT_A_REACTION" };
  }

  let expected;
  try {
    expected = sha256(sealBody(record));
  } catch {
    return { valid: false, reason: "RECORD_NOT_SEALABLE" };
  }
  if (expected !== record.self.seal) {
    return { valid: false, reason: "RECORD_ALTERED_AFTER_SEALING" };
  }

  return { valid: true, reason: null };
}

module.exports = { Observer, verifyObservation };
