"use strict";

/**
 * §7 OPEN HAND — the five questions, before a model is defended
 *
 * Section 7 of the authority-boundary design specification v0.1 gives the
 * "Open Hand" FIVE QUESTIONS. A later document by the same owner gave the same
 * name to a RATIO, A/(A+B), with a kill switch. Both exist in the project: the
 * owner settled it on 2026-09-20 — "it is a FUNCTION" — the five questions are
 * the function that is RUN on a claim (this file); the ratio is a measurement
 * READ about the system (kept in the defect register). See
 * source-conflicts.js, DISPUTE-1.
 *
 * WHY EXACTLY THESE FIVE
 *
 * The specification asks them before DEFENDING a current model — not before
 * building it. The moment is chosen precisely: defence is the instant you stop
 * looking.
 *
 * The first two are obvious and therefore not enough on their own. The load-
 * bearing ones are the third and the fourth:
 *
 *   "what else fits" asks whether rivals were looked at at all. A model that
 *   fits but is the only one tried is not checked — it is the first that came
 *   to mind.
 *
 *   "what assumption is hidden" asks about what you did not say because you did
 *   not notice you were saying it. The most expensive errors in the project were
 *   of this kind: "applicable everywhere" assumed to follow from "applied
 *   everywhere".
 *
 * THE RULE OF THIS FILE
 *
 *     AN EMPTY ANSWER MEANS "NOT LOOKED AT", NOT "THERE IS NONE".
 *
 * Fail-closed, as everywhere here. And the fifth question — "what remains
 * unknown" — CANNOT be "nothing": that is not an answer but a sign that the
 * question was not asked.
 *
 *     node open-hand-questions.js
 *     node open-hand-questions.js --selftest
 */

const QUESTIONS = Object.freeze([
  {
    key: "support",
    question: "What supports it?",
    spec: "WHAT SUPPORTS IT?",
    why: "The easiest. Asked first, to get it out of the way.",
  },
  {
    key: "disproof",
    question: "What would disprove it?",
    spec: "WHAT WOULD DISPROVE IT?",
    why: "A claim that nothing would disprove is not a claim about the " +
         "world. An empty answer here is the heaviest of the five.",
  },
  {
    key: "elseFits",
    question: "What else fits?",
    spec: "WHAT ELSE FITS?",
    why: "A model that fits but is the only one tried is not checked " +
         "— it is the first that came to mind.",
  },
  {
    key: "hiddenAssumption",
    question: "What assumption is hidden?",
    spec: "WHAT ASSUMPTION IS HIDDEN?",
    why: "What you did not say because you did not notice you were " +
         "saying it. \"Applicable everywhere\" read from \"applied everywhere\" was exactly this.",
  },
  {
    key: "unknown",
    question: "What remains unknown?",
    spec: "WHAT REMAINS UNKNOWN?",
    why: "It cannot be \"nothing\". \"Nothing\" is not an answer but a sign " +
         "that the question was not asked.",
  },
]);

const EMPTY = /^(nothing|none|n\/?a|-|—|\?)?$/i;

/**
 * Checks the open hand over one model.
 *
 * `answers` is an object with the five keys. A missing or empty key is NOT
 * taken as "there is none" — it is taken as "not looked at". That is the
 * difference the whole project defends.
 */
function openHand(model, answers = {}) {
  const rows = [];
  for (const q of QUESTIONS) {
    const a = String(answers[q.key] || "").trim();
    const empty = !a || EMPTY.test(a);
    rows.push({
      ...q,
      answer: a,
      empty,
      // The fifth has its own rule: there "nothing" is a wrong answer even when
      // it is written down, because it claims completeness.
      bad: empty || (q.key === "unknown" && EMPTY.test(a)),
    });
  }
  const bad = rows.filter((r) => r.bad);
  return {
    model,
    rows,
    unanswered: bad.map((r) => r.key),
    open: bad.length === 0,
  };
}

// ───────────────────────────────────────────────────────────────────────────

function report(r) {
  console.log(`  model: ${r.model}\n`);
  for (const x of r.rows) {
    console.log(`  ${x.bad ? "🔴" : "🟢"} ${x.question}`);
    console.log(`     ${x.bad ? "NOT LOOKED AT — " + x.why : x.answer}`);
  }
  console.log("");
  if (r.open) {
    console.log("  The hand is open: all five were looked at.");
    console.log("");
    console.log("  ⚠️ This does not mean the model is right. It means it was not");
    console.log("     defended before it was looked at.");
    return 0;
  }
  console.log(`  ${r.unanswered.length} of 5 not looked at: ${r.unanswered.join(", ")}`);
  console.log("  §7 asks for the five BEFORE the defence. An empty answer means");
  console.log("  \"not looked at\", not \"there is none\".");
  return 1;
}

function example() {
  console.log("§7 OPEN HAND — the five questions\n");
  console.log("  The same name also labels a ratio, A/(A+B), in the defect register.");
  console.log("  Resolved by the owner: the questions are the function, the ratio its measurement.\n");

  // On a real claim from the project.
  report(openHand("The defect register keeps the project from repeating forms", {
    support: "55 entries, 16 families; five forms were caught again by a " +
             "detector, not by attention.",
    disproof: "A form that comes back DESPITE its entry. There is one: " +
              "#22 repeated the same day, and the quotation mark broke five times.",
    elseFits: "That the entry does nothing and the fixes come from the " +
              "self-tests. Not separated: every entry was added TOGETHER " +
              "with a check, so the two were never measured apart.",
    hiddenAssumption: "That the forms are countable and recurring. 55 entries " +
                      "in 16 families means 3.4 on average — little for a claim " +
                      "of recurrence.",
    unknown: "Whether the register will catch a form it has not seen. " +
             "By design it cannot: it remembers, it does not think.",
  }));
  return 0;
}

function selftest() {
  let failed = 0, ran = 0;
  const k = (ok, s) => { ran++; console.log(`  ${ok ? "✓" : "✗"} ${s}`); if (!ok) failed++; };
  const full = {
    support: "a", disproof: "b", elseFits: "c",
    hiddenAssumption: "d", unknown: "e",
  };

  k(QUESTIONS.length === 5, "the five questions of §7, no more, no fewer");

  k(openHand("m", full).open, "all five answered → the hand is open");

  k(!openHand("m", {}).open, "nothing answered → not open");
  k(openHand("m", {}).unanswered.length === 5, "empty input → all five not looked at");

  k(openHand("m", { ...full, disproof: "" }).unanswered.includes("disproof"),
    "a missing disproof question is caught");

  // The load-bearing rule: empty is NOT an answer of "there is none".
  k(openHand("m", { ...full, elseFits: "nothing" }).unanswered.includes("elseFits"),
    "\"nothing\" is read as NOT LOOKED AT, not as \"no rivals\"");

  k(openHand("m", { ...full, unknown: "nothing" }).unanswered.includes("unknown"),
    "the fifth cannot be \"nothing\" — that claims completeness");

  k(openHand("m", { ...full, unknown: "don't know whether it holds below 0 K" }).open,
    "a real answer to the fifth passes");

  k(openHand("m", { ...full, support: "—" }).unanswered.includes("support"),
    "a dash is not an answer");

  k(QUESTIONS.every((q) => q.why && q.why.length > 30),
    "every question carries WHY — otherwise it is a list filled in mechanically");

  k(QUESTIONS.every((q) => q.spec && q.key && q.question),
    "every question carries the specification's text — to compare against the source");

  console.log(failed ? `\n${failed} of ${ran} failing.` : `\n${ran} checks, all passing.`);
  return failed ? 1 : 0;
}

if (require.main === module) {
  const a = process.argv[2];
  process.exit(a === "--selftest" ? selftest() : example());
}

module.exports = { QUESTIONS, openHand };
