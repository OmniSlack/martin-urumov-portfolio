"use strict";

/**
 * The honesty scale — Martin Urumov's, used to label every printed line.
 *
 * Ported (translated) from `verify/znaci.js` of omniecho-core. Only the part
 * register.js needs is carried: the levels and the line printer. His rule,
 * verbatim in translation: "Never trust UNIFORM CONFIDENCE. Every claim must
 * carry its own marker of reliability, so that facts can be told apart from
 * hypotheses."
 *
 * `strength` is his number, the order is his, the names are his.
 * `SC` stands apart: it is not a degree of confidence but a named absence.
 */
const SCALE = Object.freeze({
  ESTABLISHED: Object.freeze({ mark: "🟢", level: 4, strength: 4, name: "established",
    what: "proven by real facts, data, code or a measurable footprint in the field" }),
  MODERATE:    Object.freeze({ mark: "🟡", level: 3, strength: 3, name: "moderate",
    what: "logical and highly plausible, but without direct hard proof at the moment" }),
  LOW:         Object.freeze({ mark: "🟠", level: 2, strength: 2, name: "low",
    what: "possible, but weakly supported" }),
  HYPOTHESIS:  Object.freeze({ mark: "🔴", level: 1, strength: 1, name: "hypothesis",
    what: "a pure assumption, set up as a working theory to be tested" }),
  SYNTHESIS:   Object.freeze({ mark: "🔵", level: 0, strength: 0, name: "synthesis",
    what: "a useful image, model or analogy — NEVER becomes a scientific fact",
    open_question: "🔵 carries SYNTHESIS and METAPHOR under one name — B-20, awaiting REVIEW" }),
  UNCHECKED:   Object.freeze({ mark: "⚪", level: null, strength: 0, name: "unchecked",
    what: "text that has yet to pass through an audit" }),
  SC:          Object.freeze({ mark: "SC", level: null, strength: 0, name: "illuminated ignorance",
    what: "you know exactly what you do not know and what process or data are needed to prove it" }),
});

/** One printed line, prefixed by its marker. Unknown key → UNCHECKED, never established. */
function line(key, text) {
  const z = SCALE[key] || SCALE.UNCHECKED;
  const n = z.level === null ? "  " : String(z.level);
  return `${z.mark} ${n} ${z.name.padEnd(22)} ${text}`;
}

module.exports = { SCALE, line };
