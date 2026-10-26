"use strict";

/**
 * §18 CLAIM MUTATION PROTECTION
 *
 * Section 18 of the authority-boundary design specification v0.1:
 *
 *     Core checks whether transformations alter:
 *     CERTAINTY · SCOPE · CAUSALITY · CONDITIONS · NEGATION · TIME
 *
 *     "may" → "probably" → "is"
 *     must not pass unnoticed as an unchanged claim.
 *
 * And §16: A transformation does not silently become its source.
 *
 * WHY THIS ONE
 *
 * Because the form had already been caught FOUR times in the project, each
 * time by hand and each time late:
 *
 *   M-1  a claim sitting in QUARANTINE in its own register was exported two
 *        months later as established;
 *   M-2  "applicable everywhere, because it was applied everywhere" — the
 *        scope grew while the sentence looked the same;
 *   M-5  "four rules" in the core became "three rules, canonically updated"
 *        in another model's output;
 *   B-6  "the defects are 21" — the highest NUMBER read as a COUNT.
 *
 * Four times one form means attention does not catch it. Mutation is quiet by
 * construction: the sentence looks like the same sentence.
 *
 * WHAT IT DOES, AND WHAT IT DOES NOT
 *
 * It compares TWO versions of one claim and says which of the six changed. It
 * does NOT say which version is true — that needs evidence, not grammar. If
 * the second is stronger than the first, it needs a new source; if there is
 * none, the mutation is free and that is why it is dangerous.
 *
 * ⚠️ A BOUNDARY, stated here rather than left unsaid: this measures the FORM
 * of the sentence. A claim can mutate without changing any of these words —
 * for example by changing what the subject means. This gate will not see it.
 * It catches the cheap mutations, which are also the most common.
 *
 *     node claim-mutation.js "the older version" "the newer version"
 *     node claim-mutation.js --selftest
 */

/**
 * Word boundaries are built here, never written by hand.
 *
 * In JavaScript `\b` is computed over [A-Za-z0-9_]. Between a space and a
 * non-Latin letter there is no boundary, because both are "non-word" by that
 * definition, so a hand-written `\b...\b` around a non-Latin word NEVER matches.
 * The first version of the original file was written exactly so: all seven
 * positive checks failed and all negatives passed — it looked like a detector
 * with zero false alarms. The quietest possible failure: a tool that catches
 * NOTHING is indistinguishable from a tool with nothing to catch.
 *
 * This version is English-only, but the Unicode-aware boundary is kept: it is
 * the reason the tool can be extended to another language without repeating
 * that defect.
 */
const word = (...words) =>
  new RegExp(`(?<![\\p{L}\\p{N}_])(?:${words.join("|")})(?![\\p{L}\\p{N}_])`, "iu");

/**
 * The six axes of §18. Each carries a LADDER of words ordered by strength, and
 * the direction in which climbing needs a new source.
 *
 * The ladders are SHORT on purpose. A long ladder looks smarter and produces
 * false alarms — a defect recorded in the original project was exactly that: a
 * detector with 43 hits on zero broken files.
 */
const AXES = Object.freeze({
  CERTAINTY: {
    name: "CERTAINTY",
    ladder: [
      [1, word("may","might","possibly","could")],
      [2, word("likely","probably","seems","suggests")],
      [3, word("indicates","shows","demonstrates")],
      [4, word("proves","proven","confirms","confirmed","establishes")],
    ],
    climbNeeds: "a new source — certainty does not grow by retelling",
  },
  SCOPE: {
    name: "SCOPE",
    ladder: [
      [1, word("one","some","a few","a case")],
      [2, word("many","often","most","frequently")],
      [3, word("all","every","always","universal")],
    ],
    climbNeeds: "the cases it was checked on — scope does not grow by itself",
  },
  CAUSALITY: {
    name: "CAUSALITY",
    ladder: [
      [1, word("alongside","accompanies")],
      [2, word("associated","correlated","correlates","linked")],
      [3, word("causes","because")],
    ],
    climbNeeds: "an experiment in which only one of the two is present — otherwise it is a confound",
  },
  CONDITIONS: {
    name: "CONDITIONS",
    ladder: [
      [1, word("if","when","provided")],
      [2, word("generally","typically")],
      [3, word("unconditional","unconditionally","regardless")],
    ],
    climbNeeds: "a check without the condition — a removed condition is a claim",
  },
  NEGATION: {
    name: "NEGATION",
    // This axis has no strength — it has PRESENCE. A flipped negation is not a
    // stronger claim but a DIFFERENT claim.
    ladder: null,
    negation: word("without","never","not"),
    climbNeeds: "this is not strengthening, it is a different claim",
  },
  TIME: {
    name: "TIME",
    ladder: [
      [1, word("was","were")],
      [2, word("is","are","now","currently","today")],
      [3, word("will","remains","permanently")],
    ],
    climbNeeds: "a measurement in the new time — the past does not hold going forward",
  },
});

/** The highest rung the text reaches on this axis. 0 = none. */
function rung(text, axis) {
  if (!axis.ladder) return null;
  let top = 0;
  for (const [n, re] of axis.ladder) if (re.test(text)) top = Math.max(top, n);
  return top;
}

/**
 * Compares two versions of one claim.
 *
 * `older` is what was said; `newer` — what is said now. Returns only the axes
 * on which there is a DIFFERENCE. The absence of a difference is not proof that
 * the claim is the same — see the boundary at the top.
 */
function compare(older, newer) {
  const changes = [];

  for (const [key, axis] of Object.entries(AXES)) {
    if (key === "NEGATION") {
      const a = axis.negation.test(older);
      const b = axis.negation.test(newer);
      if (a !== b)
        changes.push({
          axis: axis.name, key,
          from: a ? "negative" : "affirmative",
          to: b ? "negative" : "affirmative",
          direction: "FLIPPED",
          needs: axis.climbNeeds,
        });
      continue;
    }
    const a = rung(older, axis);
    const b = rung(newer, axis);
    if (a === b || a === 0 || b === 0) continue;
    changes.push({
      axis: axis.name, key, from: a, to: b,
      direction: b > a ? "UP" : "down",
      needs: b > a ? axis.climbNeeds : "nothing — lowering is free and honest",
    });
  }

  const up = changes.filter((p) => p.direction === "UP" || p.direction === "FLIPPED");
  return { changes, up, silent: changes.length === 0 };
}

// ───────────────────────────────────────────────────────────────────────────

function report(older, newer) {
  const r = compare(older, newer);
  console.log("§18 CLAIM MUTATION\n");
  console.log(`  was : ${older}`);
  console.log(`  now : ${newer}\n`);

  if (r.silent) {
    console.log("  No difference on the six axes.");
    console.log("");
    console.log("  ⚠️ This does NOT mean the claim is the same. It means none of the");
    console.log("     words this gate watches has changed. A mutation through the");
    console.log("     meaning of the subject passes through here.");
    return 0;
  }

  for (const p of r.changes) {
    const sg = p.direction === "UP" ? "🔴" : p.direction === "FLIPPED" ? "🔀" : "🟢";
    console.log(`  ${sg} ${p.axis.padEnd(12)} ${p.from} → ${p.to}   ${p.direction}`);
    console.log(`       needs: ${p.needs}`);
  }
  console.log("");
  if (r.up.length) {
    console.log(`  ${r.up.length} strengthening(s) without a new source.`);
    console.log("  §18: \"may\" → \"probably\" → \"is\" must not pass unnoticed");
    console.log("  as an unchanged claim.");
    return 1;
  }
  console.log("  Only lowered. Lowering is free and needs no permission.");
  return 0;
}

const USAGE =
  "usage:\n" +
  "  node claim-mutation.js \"the older version\" \"the newer version\"\n" +
  "  node claim-mutation.js --selftest\n\n" +
  "Compares two versions of one claim on the six axes of §18 and names every\n" +
  "axis on which the newer one is stronger. Exit 1 if anything was strengthened.";

function selftest() {
  let failed = 0, ran = 0;
  const k = (ok, s) => { ran++; console.log(`  ${ok ? "✓" : "✗"} ${s}`); if (!ok) failed++; };
  const up = (a, b) => compare(a, b).up.map((x) => x.key);

  // The specification's own example.
  k(up("this may be the case", "this is probably the case").includes("CERTAINTY"),
    "\"may\" → \"probably\" → caught on CERTAINTY");
  k(up("it may work", "it works, this is proven").includes("CERTAINTY"),
    "\"may\" → \"proven\" → caught");

  // M-2, the owner's own case as recorded in the register.
  k(up("in one case the structure appears",
       "the structure appears in every field").includes("SCOPE"),
    "M-2: the scope grew from one case to every field");

  // M-3, a confound.
  k(up("the swearing goes alongside the file", "the swearing causes the result")
      .includes("CAUSALITY"),
    "M-3: co-occurrence → cause");

  k(up("it is stable when the load is low", "it is stable regardless of the load")
      .includes("CONDITIONS"),
    "a removed condition counts as strengthening");

  k(up("it was true as of 2024", "it will be true").includes("TIME"),
    "past → future is caught");

  k(up("the method works", "the method does not work").includes("NEGATION"),
    "a flipped negation is caught as FLIPPED, not as strengthening");

  // The negatives — more important than the positives.
  k(up("this is so", "this may be so").length === 0,
    "LOWERING certainty is not an alarm — otherwise the gate punishes honesty");

  k(compare("one and the same sentence", "one and the same sentence").silent,
    "identical text → nothing");

  k(up("the cat is on the roof", "the dog is in the yard").length === 0,
    "different sentences with no ladder words → zero false alarms");

  // A detector that alarms everywhere gets switched off by people.
  const noise = [
    ["I ran the test", "I ran the test again"],
    ["the file is large", "the file is small"],
    ["I added a line", "I removed a line"],
  ].filter(([a, b]) => up(a, b).length > 0);
  k(noise.length === 0, `three innocent pairs → zero alarms (noise: ${noise.length})`);

  k(Object.keys(AXES).length === 6, "the six axes of §18, no more, no fewer");

  // The defect fixed 2026-10-26: the no-argument path must print usage and
  // exit 2, not crash.
  k(typeof USAGE === "string" && /claim-mutation\.js/.test(USAGE),
    "usage text exists (the original crashed with ReferenceError: __doc__)");

  console.log(failed ? `\n${failed} of ${ran} failing.` : `\n${ran} checks, all passing.`);
  return failed ? 1 : 0;
}

if (require.main === module) {
  const a = process.argv.slice(2);
  if (a[0] === "--selftest") process.exit(selftest());
  if (a.length < 2) {
    // DEFECT, fixed 2026-10-26: the original called `console.log(__doc__ || ...)`
    // — a Python idiom. In JavaScript `__doc__` is an undeclared identifier,
    // so this path threw ReferenceError before printing anything.
    console.log(USAGE);
    process.exit(2);
  }
  process.exit(report(a[0], a[1]));
}

module.exports = { AXES, compare, rung, USAGE };
