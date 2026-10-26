"use strict";

/**
 * §5 OBSERVATION — the four statuses, and the ban on filling UNKNOWN
 *
 * Section 5 of the authority-boundary design specification v0.1:
 *
 *     DIRECTLY OBSERVED · INFERRED · UNSUPPORTED · UNKNOWN
 *     Core does not silently fill UNKNOWN.
 *     UNKNOWN ≠ STOP COGNITION
 *
 * WHY THIS IS NOT THE SAME AS THE CONFIDENCE SCALE
 *
 * The honesty scale measures HOW SURE I AM (🟢🟡🟠🔴🔵⚪). Its second axis
 * measures WHERE THE NUMBER COMES FROM (measured, derived, defined, never
 * observed).
 *
 * This gate measures a third thing: HOW DO I KNOW THIS. The three are
 * different questions, and precisely because they look alike, merging them
 * looks like a saving.
 *
 *   "214 tests pass"                    DIRECTLY OBSERVED · 🟢 · MEASURED
 *   "the code is reliable"              INFERRED          · 🟡 · DERIVED
 *   "the method is unique"              UNSUPPORTED       · 🔴 · —
 *   "it will work for another person"   UNKNOWN           · ⚪ · —
 *
 * The fourth row is the reason the gate exists. Without it "I don't know"
 * has nowhere to live and slides upward — most often to INFERRED, because
 * there it sounds like thought rather than a gap.
 *
 * THE TWO RULES, and the second is the harder one
 *
 * 1. UNKNOWN IS NOT FILLED SILENTLY. Producing plausible content for an empty
 *    slot is the cheapest possible move and leaves a trace indistinguishable
 *    from the trace of knowledge.
 *
 * 2. UNKNOWN ≠ STOPPING THOUGHT. This is the opposite error and it is quieter:
 *    the gate can degenerate into an excuse not to think. The specification
 *    forbids it explicitly. So here every UNKNOWN MUST say WHAT WOULD RESOLVE
 *    IT — otherwise it is a refusal dressed as a status.
 *
 *     node observation-status.js
 *     node observation-status.js --selftest
 */

const STATUS = Object.freeze({
  OBSERVED:    "DIRECTLY OBSERVED",
  INFERRED:    "INFERRED",
  UNSUPPORTED: "UNSUPPORTED",
  UNKNOWN:     "UNKNOWN",
});

/**
 * Determines the status of one claim from WHAT IS SUPPLIED — not from how it
 * sounds.
 *
 *   observation     what was seen/run/measured, and with what
 *   inference       through which model one gets from the observation to the claim
 *   wouldResolve    what would turn UNKNOWN into something else
 *
 * ⚠️ The order of the checks is NOT arbitrary. Observation is asked first,
 * because it is the most expensive and the rarest; the unknown last, because
 * it is the default. Reversed, every gap would become an "inference".
 */
function status({ claim, observation = "", inference = "", wouldResolve = "" }) {
  const n = String(observation).trim();
  const i = String(inference).trim();
  const r = String(wouldResolve).trim();

  if (n) {
    return {
      claim, status: STATUS.OBSERVED, basis: n,
      // The observed is NOT automatically true. It is true for what was run —
      // the scope remains a question for the time/scope gate.
      note: "True for the case that was run. Scope is a separate question.",
    };
  }
  if (i) {
    return {
      claim, status: STATUS.INFERRED, basis: i,
      note: "Falls together with the model it was inferred through. The model " +
            "is named, otherwise the inference is a claim with better manners.",
    };
  }
  // Here is the difference between "I have no support" and "I don't know",
  // and it is not verbal: UNSUPPORTED means the claim WAS MADE without a basis;
  // UNKNOWN means the question stands open and it is known what would close it.
  if (r) {
    return {
      claim, status: STATUS.UNKNOWN, basis: null,
      resolvedBy: r,
      note: "UNKNOWN ≠ stopping thought. The question is open and it is " +
            "known what would close it.",
    };
  }
  return {
    claim, status: STATUS.UNSUPPORTED, basis: null,
    note: "A claim with no observation, no named inference and no path to " +
          "resolution. This is not \"not known yet\" — it is said on empty.",
  };
}

/**
 * Checks a WHOLE report: does every claim carry a status, and has any UNKNOWN
 * been filled silently?
 *
 * The most important thing this pass catches: a claim declared INFERRED whose
 * "inference" names no model. Then the status is a costume.
 */
function checkReport(rows) {
  const problems = [];
  for (const r of rows) {
    const s = status(r);
    if (s.status === STATUS.INFERRED && !/because|through|via|by |from |model|formula|means/i.test(s.basis))
      problems.push(`"${r.claim}": declared INFERRED, but the inference does not name THROUGH WHAT`);
    if (s.status === STATUS.UNKNOWN && s.resolvedBy.length < 15)
      problems.push(`"${r.claim}": UNKNOWN with no real path to resolution`);
    if (s.status === STATUS.UNSUPPORTED)
      problems.push(`"${r.claim}": UNSUPPORTED — said without a basis`);
  }
  return problems;
}

// ───────────────────────────────────────────────────────────────────────────

const SIGN = {
  [STATUS.OBSERVED]: "🟢",
  [STATUS.INFERRED]: "🟡",
  [STATUS.UNSUPPORTED]: "🔴",
  [STATUS.UNKNOWN]: "⚪",
};

function example() {
  console.log("§5 OBSERVATION — how do I know this\n");
  console.log("  Different from confidence (how sure am I) and from the origin");
  console.log("  of the quantity (where the number comes from). A third question.\n");

  const rows = [
    { claim: "214 tests pass and 37 checks are green",
      observation: "node verify/all.js, run now" },
    { claim: "The open-hand ratio is 0.746",
      inference: "through counting the entries in the register, split by the column WHO" },
    { claim: "The method works for another person",
      wouldResolve: "one case in which someone else applied the method " +
                    "and got a comparable result, without me in the conversation" },
    { claim: "These tools are unique" },
  ];

  for (const r of rows) {
    const s = status(r);
    console.log(`  ${SIGN[s.status]} ${s.status.padEnd(18)} ${s.claim}`);
    if (s.basis) console.log(`       basis: ${s.basis}`);
    if (s.resolvedBy) console.log(`       resolved by: ${s.resolvedBy}`);
    console.log(`       ${s.note}`);
    console.log("");
  }

  const problems = checkReport(rows);
  if (problems.length) {
    console.log("  🔴 IN THIS REPORT:");
    for (const b of problems) console.log(`     ${b}`);
    console.log("");
    console.log("  The last one is left in on purpose: this is what a claim said");
    console.log("  on empty looks like when it does not pretend to be an inference.");
  }
  return 0;
}

function selftest() {
  let failed = 0, ran = 0;
  const k = (ok, s) => { ran++; console.log(`  ${ok ? "✓" : "✗"} ${s}`); if (!ok) failed++; };
  const st = (o) => status(o).status;

  k(Object.keys(STATUS).length === 4, "the four statuses of §5, no more");

  k(st({ claim: "x", observation: "I ran it and saw it" }) === STATUS.OBSERVED,
    "observation supplied → DIRECTLY OBSERVED");

  k(st({ claim: "x", inference: "through the Bogacz model" }) === STATUS.INFERRED,
    "no observation, a named inference → INFERRED");

  k(st({ claim: "x", wouldResolve: "a measurement on a second person" })
      === STATUS.UNKNOWN, "neither, but a path exists → UNKNOWN");

  k(st({ claim: "x" }) === STATUS.UNSUPPORTED,
    "nothing supplied → UNSUPPORTED, not UNKNOWN");

  // The difference between the two empty states is the gate's whole job.
  k(st({ claim: "x" }) !== st({ claim: "x", wouldResolve: "an experiment" }),
    "\"said on empty\" and \"not known yet\" are NOT one state");

  // Rule 1: UNKNOWN is not filled silently.
  k(st({ claim: "x", observation: "", inference: "" }) !== STATUS.INFERRED,
    "an empty inference does NOT produce INFERRED — the gap does not slide upward");

  // Rule 2, the harder one: UNKNOWN is not a refusal to think.
  k(checkReport([{ claim: "x", wouldResolve: "don't know" }]).length > 0,
    "UNKNOWN with no real path to resolution → flagged (otherwise it is an excuse)");

  k(checkReport([{ claim: "x", inference: "it just is so" }]).length > 0,
    "INFERRED with no named model → flagged; the status is not a costume");

  k(checkReport([{ claim: "x", observation: "run with node --test" }]).length === 0,
    "a real observation raises nothing");

  // The observed is not automatically true for everything.
  k(/Scope/.test(status({ claim: "x", observation: "I saw it" }).note),
    "the observed carries a note on SCOPE — true for what was run, not in general");

  console.log(failed ? `
${failed} of ${ran} failing.` : `
${ran} checks, all passing.`);
  return failed ? 1 : 0;
}

if (require.main === module) {
  process.exit(process.argv[2] === "--selftest" ? selftest() : example());
}

module.exports = { STATUS, status, checkReport };
