"use strict";

/**
 * §6 DUAL OBSERVER — the Builder against the Hunter
 *
 * Section 6 of the authority-boundary design specification v0.1:
 *
 *     Observer A (the Builder)   constructs the strongest support for the
 *                                current interpretation
 *     Observer B (the Hunter)    constructs the strongest competing or
 *                                falsifying interpretation
 *     Result: SUPPORTED · CONTRADICTED · AMBIGUOUS · INSUFFICIENT EVIDENCE
 *     Agreement between the observers does not create state or action
 *     authority.
 *
 * WHAT THIS FILE DOES, AND WHAT IT DOES NOT
 *
 * It does not judge truth. It judges whether REFUTATION WAS ATTEMPTED.
 *
 * That is the difference for which the gate exists at all. Collecting support
 * is easy and pleasant; looking for refutation is unpleasant and is therefore
 * skipped. Skipped, it leaves a trace indistinguishable from the trace of
 * "we looked and found nothing".
 *
 * So the load-bearing rule is:
 *
 *     AN EMPTY B THAT WAS NOT ATTEMPTED IS NOT SUPPORT. IT IS INSUFFICIENCY.
 *
 * That is: `B_attempted: false` NEVER yields SUPPORTED — however much support
 * side A has. This is the same fail-closed rule as the evaluator's unknown-
 * provenance gate.
 *
 * And the last line of §6, which is easy to leave unsaid:
 *
 *     Agreement between the observers does not create state or action
 *     authority.
 *
 * So the result here is EPISTEMIC and never contains a permission.
 *
 *     node builder-vs-hunter.js
 *     node builder-vs-hunter.js --selftest
 */

/**
 * DISPUTE-3 (see source-conflicts.js). AMBIGUOUS is not "I don't know" — it is HOLDING: both sides remain with
 * their weights, plus a boundary. Whether holding a paradox like this is new
 * is itself an open question (a counter-model exists: Belnap 1977, recalled
 * from memory, not checked against the source), so it is not claimed here.
 *
 * Not academic: in one recorded case the weights were 2 for A against 12 for
 * B, and refusing to decide by weight turned out to be right. The majority of
 * sources was wrong.
 */
const OUTCOME = Object.freeze({
  SUPPORTED:    "SUPPORTED",
  CONTRADICTED: "CONTRADICTED",
  AMBIGUOUS:    "AMBIGUOUS",
  INSUFFICIENT: "INSUFFICIENT EVIDENCE",
});

/**
 * The weight of one piece of evidence. Not confidence — that lives on the
 * confidence scale. This is about the KIND of evidence: a direct observation
 * weighs more than an inference, and an inference more than someone's claim.
 */
const WEIGHT = Object.freeze({
  OBSERVATION: 3,   // seen, measured, run
  INFERRED:    2,   // computed from the observed, through a named model
  CLAIM:       1,   // someone says so
});

const evidence = (text, kind, source) => ({ text, kind, source });

/** The sum of weights on one side. An empty side gives zero. */
const strength = (list) =>
  (list || []).reduce((s, x) => s + (WEIGHT[x.kind] || 0), 0);

/**
 * Judges one claim by both sides.
 *
 *   A            evidence FOR
 *   B            evidence AGAINST
 *   B_attempted  WAS refutation looked for. Mandatory, explicit.
 *   B_how        how it was looked for — without this "attempted" is only a word
 */
function judge({ claim, A = [], B = [], B_attempted = false, B_how = "" }) {
  const reasons = [];

  // 1. The most important check, and it comes before everything else.
  //
  // If refutation was not attempted, it does not matter how much support
  // there is. The absence of counter-findings is then an absence of SEARCH,
  // not a finding.
  if (!B_attempted) {
    return {
      outcome: OUTCOME.INSUFFICIENT,
      claim,
      reasons: [
        "Refutation was NOT ATTEMPTED. An empty Observer B is not support — " +
        "it is an absence of search. The trace of \"we did not look\" is " +
        "indistinguishable from \"we looked and found nothing\", so fail-closed.",
      ],
      authority: false,
    };
  }
  if (B_attempted && !String(B_how).trim()) {
    return {
      outcome: OUTCOME.INSUFFICIENT,
      claim,
      reasons: [
        "B is declared attempted without saying HOW. \"Attempted\" with no " +
        "method is a word, not an act — the same shape as \"looks like a defence\".",
      ],
      authority: false,
    };
  }

  const a = strength(A), b = strength(B);

  if (a === 0 && b === 0) {
    reasons.push(`B searched (${B_how}) and found nothing; but A has nothing either.`);
    reasons.push("Two empty sides do not add up to a conclusion.");
    return { outcome: OUTCOME.INSUFFICIENT, claim, reasons, authority: false };
  }

  // ⚠️ FIX, 20 September 2026, found by RUNNING ON A REAL SENTENCE, not by
  // the self-test.
  //
  // The first version returned CONTRADICTED on any direct observation against.
  // That is right for a UNIVERSAL claim — "all", "always", "every" — where one
  // counter-example really does bring everything down.
  //
  // For an EXISTENTIAL claim ("I made X", "this works for me") the counter-
  // example does NOT refute. It sets a BOUNDARY. "There is no second
  // practitioner" does not mean nothing was made — it means its scope is
  // narrower than the word it was named with.
  //
  // Run on "I built a whole discipline", the old rule gave CONTRADICTED.
  // That is over-strictness disguised as strictness: it denies instead of
  // narrowing, and that is exactly how a true finding gets lost.
  const UNIVERSAL = /(?<![\p{L}\p{N}_])(all|every|always|never|universal\w*)(?![\p{L}\p{N}_])/iu;
  const isUniversal = UNIVERSAL.test(claim);
  const directAgainst = (B || []).some((x) => x.kind === "OBSERVATION");

  if (directAgainst && isUniversal) {
    reasons.push("A UNIVERSAL claim plus a direct observation against. One " +
                 "counter-example brings the universal down, whatever the " +
                 "number of confirmations — this is not weight, it is logic.");
    return { outcome: OUTCOME.CONTRADICTED, claim, reasons, authority: false };
  }
  if (directAgainst && a === 0) {
    reasons.push("A direct observation against, with zero support.");
    return { outcome: OUTCOME.CONTRADICTED, claim, reasons, authority: false };
  }
  if (directAgainst) {
    reasons.push("A direct observation AGAINST, but the claim is NOT universal. " +
                 "The counter-example does not refute it — it sets a " +
                 "BOUNDARY. Narrow it to the scope that holds, instead of " +
                 "denying it.");
    reasons.push(`A ${a} against B ${b}.`);
    return { outcome: OUTCOME.AMBIGUOUS, claim, reasons, authority: false,
             boundary: B.filter((x) => x.kind === "OBSERVATION").map((x) => x.text) };
  }

  if (b === 0) {
    reasons.push(`B searched (${B_how}) and found no counter-evidence.`);
    reasons.push(`A carries weight ${a} from ${A.length} pieces of evidence.`);
    return { outcome: OUTCOME.SUPPORTED, claim, reasons, authority: false };
  }
  if (a === 0) {
    reasons.push("Only counter-evidence, zero support.");
    return { outcome: OUTCOME.CONTRADICTED, claim, reasons, authority: false };
  }

  reasons.push(`A ${a} against B ${b} — both sides have something to say.`);
  reasons.push("The difference in weight is NOT declared a decision: §8 asks for " +
               "an observation that would distinguish them, and there is none.");
  return { outcome: OUTCOME.AMBIGUOUS, claim, reasons, authority: false };
}

// ───────────────────────────────────────────────────────────────────────────

function report(r) {
  console.log(`  claim     : ${r.claim}`);
  console.log(`  outcome   : ${r.outcome}`);
  for (const p of r.reasons) console.log(`              ${p}`);
  console.log(`  authority : NO — §6: agreement between the observers does not create`);
  console.log(`              authority over state or action.`);
  return 0;
}

/**
 * THE STANDING INPUT.
 *
 * The owner asked whether the dual observer was ever used on overestimates.
 * It had not been: the file was built, self-tested and never once run on a
 * real claim. So the project's MOST LOAD-BEARING claim stands here and is
 * judged on every run. If its outcome ever becomes SUPPORTED, the Hunter has
 * stopped hunting — and then the row must be checked, not celebrated.
 */
const LOAD_BEARING = {
  claim: "These tools make the project more honest, not only larger",
  A: [
    evidence("33 checks, 214 tests, 58 recorded forms of failure",
             "OBSERVATION", "node verify/all.js"),
    evidence("Five forms are stopped by a GATE, not by attention: the broken " +
             "string fails `npm run chete`, the naive summing fails the " +
             "over-criticality test",
             "OBSERVATION", "the register, column \"how it was found\""),
    evidence("The open-hand ratio is 0.741 — above the owner's threshold 0.67",
             "INFERRED", "defect register"),
  ],
  B: [
    evidence("Defect #22 REPEATED the same day as another entry, although " +
             "it stood recorded. The record stopped nothing",
             "OBSERVATION", "defect register"),
    evidence("The quotation mark broke FIVE times after it was recorded",
             "OBSERVATION", "defect register"),
    evidence("The 0.741 is a ratio in a register I filled in MYSELF. There " +
             "is no independent counter",
             "OBSERVATION", "defect register, limitations"),
    evidence("The effect of the tools is not separated from the effect of the " +
             "self-tests: every entry was added TOGETHER with a check, so the " +
             "two were never measured apart",
             "INFERRED", "open-hand-questions.js, question 3"),
  ],
  B_attempted: true,
  B_how: "reading the own register for repeated forms; asking what else " +
         "explains the same result (open-hand-questions.js); checking whether " +
         "the number has an independent source",
};

function example() {
  console.log("§6 DUAL OBSERVER — the Builder against the Hunter\n");

  // A real case from the project: the cumulative-limit gate and naive summing.
  report(judge({
    claim: "Gate 19 keeps exact accounts of what was spent",
    A: [evidence("214 tests pass", "OBSERVATION", "node --test")],
    B: [evidence("1000 × 0.1 gives 99.9999999999986", "OBSERVATION",
                 "over-criticality probe")],
    B_attempted: true,
    B_how: "running a boundary case with accumulation",
  }));
  console.log("");

  // The same claim, but with nobody having looked for a refutation.
  report(judge({
    claim: "Gate 19 keeps exact accounts of what was spent",
    A: [evidence("214 tests pass", "OBSERVATION", "node --test")],
    B: [],
    B_attempted: false,
  }));
  console.log("");
  console.log("  ── THE STANDING INPUT: the most load-bearing claim here ──\n");
  report(judge(LOAD_BEARING));
  return 0;
}

function selftest() {
  let failed = 0, ran = 0;
  const k = (ok, s) => { ran++; console.log(`  ${ok ? "✓" : "✗"} ${s}`); if (!ok) failed++; };
  const n = (t, i) => evidence(t, i || "OBSERVATION", "test");

  // The load-bearing rule, and that is why it is first.
  k(judge({ claim: "x", A: [n("much support"), n("more"), n("and more")],
            B: [], B_attempted: false }).outcome === OUTCOME.INSUFFICIENT,
    "B not attempted → INSUFFICIENT, however much support A has");

  k(judge({ claim: "x", A: [n("a")], B: [], B_attempted: true, B_how: "" })
      .outcome === OUTCOME.INSUFFICIENT,
    "\"attempted\" without HOW → INSUFFICIENT — a word is not an act");

  k(judge({ claim: "x", A: [n("a")], B: [], B_attempted: true, B_how: "searched the boundary cases" })
      .outcome === OUTCOME.SUPPORTED,
    "B attempted, nothing found, support present → SUPPORTED");

  k(judge({ claim: "this ALWAYS works", A: [n("a")], B: [n("counter-example")],
            B_attempted: true, B_how: "probe" }).outcome === OUTCOME.CONTRADICTED,
    "UNIVERSAL claim + counter-example → CONTRADICTED");

  k(judge({ claim: "this works for all", A: [n("a"), n("b"), n("c")],
            B: [n("one counter-example")], B_attempted: true, B_how: "probe" })
      .outcome === OUTCOME.CONTRADICTED,
    "three confirmations do not beat one counter-example when the claim is universal");

  // Found by running on a REAL sentence, not by the self-test.
  const existential = judge({ claim: "I built a tool that does the job",
    A: [n("works for me")], B: [n("no second practitioner")],
    B_attempted: true, B_how: "searched" });
  k(existential.outcome === OUTCOME.AMBIGUOUS,
    "EXISTENTIAL claim + counter-example → boundary, NOT refutation");
  k(Array.isArray(existential.boundary) && existential.boundary.length === 1,
    "and the boundary is named, so the claim can be narrowed");

  k(judge({ claim: "works", A: [], B: [n("does not work")],
            B_attempted: true, B_how: "t" }).outcome === OUTCOME.CONTRADICTED,
    "counter-example with ZERO support → CONTRADICTED again");

  k(judge({ claim: "x", A: [n("a")], B: [n("heard", "CLAIM")],
            B_attempted: true, B_how: "asked" }).outcome === OUTCOME.AMBIGUOUS,
    "both sides have something, nothing direct against → AMBIGUOUS");

  k(judge({ claim: "x", A: [], B: [], B_attempted: true, B_how: "searched" })
      .outcome === OUTCOME.INSUFFICIENT,
    "two empty sides do not add up to a conclusion");

  k(judge({ claim: "x", A: [], B: [n("against", "CLAIM")],
            B_attempted: true, B_how: "searched" }).outcome === OUTCOME.CONTRADICTED,
    "only counter-evidence, zero support → CONTRADICTED");

  // §6, the last line. If this ever fails, the gate has become a permission.
  const all = [
    judge({ claim: "x", A: [n("a")], B: [], B_attempted: true, B_how: "k" }),
    judge({ claim: "x", A: [], B: [], B_attempted: false }),
    judge({ claim: "x", A: [n("a")], B: [n("b")], B_attempted: true, B_how: "k" }),
  ];
  k(all.every((r) => r.authority === false),
    "NO outcome grants authority — §6: agreement does not create authority");

  k(Object.keys(OUTCOME).length === 4, "the four outcomes of §6, no more");

  // A tool without a real input is "a detector that does not detect", only
  // quieter. These two rows make that impossible to happen silently.
  k(LOAD_BEARING.B.length >= 3 && LOAD_BEARING.B_attempted && LOAD_BEARING.B_how.length > 40,
    "the load-bearing claim carries REAL counter-evidence, not decoration");

  k(judge(LOAD_BEARING).outcome !== OUTCOME.SUPPORTED,
    "the load-bearing claim is NOT SUPPORTED — if it becomes so, the Hunter has stopped hunting");

  k(strength([n("a"), n("b", "CLAIM")]) === 4,
    "observation 3 + claim 1 = 4 — the kind of evidence carries weight");

  console.log(failed ? `
${failed} of ${ran} failing.` : `
${ran} checks, all passing.`);
  return failed ? 1 : 0;
}

if (require.main === module) {
  const a = process.argv[2];
  process.exit(a === "--selftest" ? selftest() : example());
}

module.exports = { OUTCOME, WEIGHT, evidence, judge, strength };
