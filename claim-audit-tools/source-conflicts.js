"use strict";

/**
 * SOURCE CONFLICTS — when two sources with equal standing say different things
 *
 * THE RULE, as written in the authority-boundary design specification v0.1:
 *
 *   §23 Supersession:
 *       NEWER ≠ AUTOMATICALLY AUTHORITATIVE
 *
 *   §19 Contradictions:
 *       Core preserves both SUPPORTING and CONTRADICTING evidence.
 *       It does not silently select the convenient source.
 *       If unresolved: AMBIGUOUS / HOLD.
 *
 *   §22 Semantics of the accepted state:
 *       ACCEPTED STATUS: VALID · EPISTEMIC STATUS: CHALLENGED ·
 *       PROPOSAL: REVIEW — without silently rewriting the accepted state.
 *
 *   And a separate note by the owner: "A conflict between sources is not
 *   resolved by a confident tone, a file name or a higher version."
 *
 * WHY THIS FILE EXISTS
 *
 * The most convenient exit from two disagreeing sources is to take the newer
 * one and carry on. That is a silent decision: nowhere is it recorded that a
 * choice existed, and the next reader sees one opinion instead of two.
 *
 * So here a dispute is HELD. It is not resolved. Resolving it needs a human —
 * §20 Human Confirmation Contract — and the assistant is not that human.
 *
 * WHAT FAILS, AND WHAT DOES NOT
 *
 * The check does NOT fail because a dispute is unresolved: resolving it is not
 * in the tool's hands, and permanent red would kill the signal. It fails when a
 * disputed name is used UNMARKED — that is, when code uses the term without
 * saying it is disputed. Silent use is exactly "silently select the convenient
 * source".
 *
 * The three disputes below are the ones recorded in the original project. The
 * files they point to are in this folder (two tools and one sample), so the
 * check runs here as it ran there.
 *
 *     node source-conflicts.js
 *     node source-conflicts.js --selftest
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;

const DISPUTES = [
  {
    id: "DISPUTE-1",
    name: "Open Hand",
    // ─────────────────────────────────────────────────────────────────
    // DECIDED BY THE OWNER, 20 September 2026, verbatim:
    //
    //     "Why do they prescribe a number for the open hand —
    //      it is a FUNCTION!!"
    //
    // And right by construction, not by taste: A/(A+B) cannot BE the
    // definition, because it is a quantity measured ON a system. The five
    // questions are an action that is PERFORMED. One is done, the other is
    // read off.
    //
    // So the two sources were never in conflict — the specification gives
    // the FUNCTION, the later document gives the MEASUREMENT of it. Merged
    // under one name, they looked like a dispute. That was the assistant's
    // reading, not the owner's.
    // ─────────────────────────────────────────────────────────────────
    state: "DECIDED BY THE OWNER",
    sources: [
      {
        document: "design specification v0.13, §7",
        status: "ACCEPTED: YES · IMPLEMENTED: NO",
        says:
          "FIVE QUESTIONS, asked before defending a current model: What supports " +
          "it? · What would disprove it? · What else fits? · What assumption " +
          "is hidden? · What remains unknown?",
      },
      {
        document: "observer architecture v2.26 (the owner's slides, 20 Sep 2026)",
        status: "ACCEPTED, with a kill switch",
        says:
          "A RATIO A/(A+B) — the share of defects caught by the evaluator itself " +
          "out of all; threshold 0.67, below which the kill switch fires.",
      },
    ],
    howUsed:
      "The defect register computes A/(A+B) and calls it \"open hand\"; " +
      "open-hand-questions.js implements the five questions under the same name.",
    whyNotDecided:
      "DECIDED. It stood in HOLD because the author had not been asked. He " +
      "answered on 20 September 2026, verbatim: \"it is a FUNCTION\". The guess " +
      "recorded here beforehand — that the second may be the measure of the " +
      "first — turned out right, but it was NOT the guess that closed the " +
      "dispute: his word did. A guess, however accurate, is not confirmation (§20).",
    markedIn: ["open-hand-questions.js"],
  },
  {
    id: "DISPUTE-2",
    name: "Dual Observer",
    state: "HOLD",
    sources: [
      {
        document: "design specification v0.13, §6",
        status: "ACCEPTED: YES · IMPLEMENTED: NO",
        says:
          "Observer A builds the STRONGEST SUPPORT for the current interpretation; " +
          "Observer B the strongest COMPETING or refuting one. Outcome: " +
          "SUPPORTED / CONTRADICTED / AMBIGUOUS / INSUFFICIENT EVIDENCE. " +
          "Agreement between the two does NOT create authority over state.",
      },
      {
        document: "the owner, verbatim, 20 September 2026",
        status: "a direct instruction",
        says:
          "\"This is the dual observer — to remember where you started from. " +
          "Control preserves. Everything named.\" That is, A = NOW, " +
          "B = THE START, and the finding is in the drift between them.",
      },
    ],
    howUsed:
      "A drift tool in the original project was built to the second meaning and " +
      "carries the name of the first (sample: samples/source-conflicts/" +
      "drift-observer-note.md). builder-vs-hunter.js implements the first.",
    whyNotDecided:
      "The instruction is the owner's and explicit; the specification is the " +
      "owner's and older. It may be an extension of the term rather than a " +
      "divergence. But deciding alone which of the two is the \"real\" meaning of " +
      "the owner's term would be a promotion without the owner's gate.",
    markedIn: ["samples/source-conflicts/drift-observer-note.md"],
  },
  {
    id: "DISPUTE-3",
    name: "A held paradox — is it unprecedented",
    // ─────────────────────────────────────────────────────────────────
    // The owner's claim, 20 September 2026: the method does something
    // "truly unseen until now — a paradox can be HELD, not rejected".
    //
    // Split in two, because one half is measured and the other has a
    // counter-model.
    //
    // MEASURED (this holds): the evaluator raises a terminal STOP in exactly
    // one place — an external action — and HOLD in twenty-three. Rejection is
    // the EXCEPTION, 1 in 23. And builder-vs-hunter.js, faced with counter-
    // evidence, does not choose: it returns AMBIGUOUS with both weights and a
    // BOUNDARY.
    //
    // COUNTER-MODEL (this does not hold): holding a contradiction without
    // explosion has been described before. §8 asks for it to be named, not
    // left unsaid.
    // ─────────────────────────────────────────────────────────────────
    state: "HOLD",
    sources: [
      {
        document: "the owner, 20 September 2026",
        status: "the owner's claim about his own method",
        says:
          "\"My method does something truly unseen until now — a paradox can be " +
          "held, not rejected.\"",
      },
      {
        document: "da Costa 1963 (paraconsistent logics); " +
          "Belnap 1977 (four-valued: TRUE · FALSE · BOTH · NEITHER)",
        status: "⚠️ FROM MEMORY, NOT CHECKED AGAINST THE SOURCE",
        says:
          "That from P ∧ ¬P not everything follows, and that BOTH is a HELD paradox " +
          "in a machine receiving contradictory data — for nearly fifty years. " +
          "If true, \"unseen until now\" falls for this half.",
      },
    ],
    howUsed:
      "The mechanism exists and is measured: 1 STOP against 23 HOLD in the " +
      "evaluator, AMBIGUOUS with a boundary in builder-vs-hunter.js. Only the " +
      "SCOPE of the word \"unseen\" is disputed, not that the thing works.",
    whyNotDecided:
      "Two reasons, both the assistant's limits, not the owner's. FIRST: the " +
      "citations above are from memory — there is no checked primary source, and " +
      "weighing the owner's claim against an unchecked citation is exactly what " +
      "§19 forbids. SECOND: the distinction offered — that Belnap answers a " +
      "question of TRUTH and HOLD a question of AUTHORITY, and that §0 separates " +
      "cognition from action, which four-valued logic does not — is a reading, " +
      "not a measurement. It may be the right distinction and it may be the " +
      "convenient one.",
    markedIn: ["builder-vs-hunter.js"],
  },
];

// ───────────────────────────────────────────────────────────────────────────
// The marker. A file that uses a disputed name must carry the dispute's id.
// Without it the code asserts the term as if the question were closed.
// ───────────────────────────────────────────────────────────────────────────

function unmarked() {
  const problems = [];
  for (const s of DISPUTES) {
    for (const f of s.markedIn) {
      const p = path.join(ROOT, f);
      if (!fs.existsSync(p)) { problems.push(`${s.id}: ${f} is missing`); continue; }
      if (!fs.readFileSync(p, "utf8").includes(s.id))
        problems.push(`${s.id}: ${f} uses "${s.name}" without saying it is disputed`);
    }
  }
  return problems;
}

function run() {
  console.log("DISPUTES — two sources, equal standing, different content\n");
  console.log("  The rule: NEWER ≠ AUTOMATICALLY AUTHORITATIVE");
  console.log("  (design specification, §23). A dispute is HELD, not resolved.\n");

  for (const s of DISPUTES) {
    console.log(`  ${s.id} · ${s.name}   [${s.state}]`);
    for (const i of s.sources) {
      console.log(`     ─ ${i.document}`);
      console.log(`       ${i.status}`);
      console.log(`       says: ${i.says}`);
    }
    console.log(`     in the code: ${s.howUsed}`);
    console.log(`     why not decided here: ${s.whyNotDecided}`);
    console.log("");
  }

  const problems = unmarked();
  if (problems.length) {
    console.log("  🔴 UNMARKED USE:");
    for (const b of problems) console.log(`     ${b}`);
    console.log("");
    console.log("  This is \"silently select the convenient source\" (§19).");
    return 1;
  }

  const held = DISPUTES.filter((s) => s.state === "HOLD").length;
  console.log(`${DISPUTES.length} disputes, ${held} in HOLD, all marked in the code.`);
  console.log("");
  console.log("  ACCEPTED STATUS:  VALID");
  console.log("  EPISTEMIC:        CHALLENGED");
  console.log("  PROPOSAL:         REVIEW  →  waits for the owner (§20)");
  console.log("");
  console.log("  ⚠️ HOLD is not a problem to wait out. It is a state that must be");
  console.log("     SEEN until the human says which is which. So it is printed");
  console.log("     on every run.");
  return 0;
}

function selftest() {
  let failed = 0, ran = 0;
  const k = (ok, s) => { ran++; console.log(`  ${ok ? "✓" : "✗"} ${s}`); if (!ok) failed++; };

  k(DISPUTES.every((s) => s.sources.length >= 2),
    "a dispute with one source is not a dispute");

  k(DISPUTES.every((s) => s.sources.every((i) => i.document && i.says && i.status)),
    "every source carries a name, a status and what it says");

  k(DISPUTES.every((s) => s.whyNotDecided.length > 60),
    "every dispute says WHY it is not decided — otherwise it is laziness with a label");

  // ⚠️ The first version required ALL to be in HOLD. Then a decided dispute
  // would have to be DELETED — and a deleted dispute looks like a dispute that
  // never existed. §23: "a new version does not erase the old lineage." So the
  // decided one STAYS, but must say WHO decided it and IN WHAT WORDS.
  k(DISPUTES.every((s) => s.state === "HOLD" || /DECIDED BY THE OWNER/.test(s.state)),
    "a dispute is either in HOLD or DECIDED BY THE OWNER — never decided by the tool");

  k(DISPUTES.filter((s) => s.state !== "HOLD")
      .every((s) => /verbatim|"/.test(s.whyNotDecided)),
    "the decided one carries the WORDS it was decided with — not only a label");

  k(new Set(DISPUTES.map((s) => s.id)).size === DISPUTES.length,
    "the ids are distinct");

  k(DISPUTES.every((s) => s.markedIn.length > 0),
    "every dispute points to where the disputed name is used");

  k(unmarked().length === 0,
    "no disputed name is used unmarked");

  // The reverse check: if the marker is removed, the check must FAIL.
  // Without this it is a line that always passes.
  const file = DISPUTES[0].markedIn[0];
  const old = DISPUTES[0].id;
  DISPUTES[0].id = "NOT-IN-ANY-FILE";
  const caught = unmarked().some((b) => b.includes(file));
  DISPUTES[0].id = old;
  k(caught, "marker removed → the check fails (otherwise it checks nothing)");

  console.log(failed ? `\n${failed} of ${ran} failing.` : `\n${ran} checks, all passing.`);
  return failed ? 1 : 0;
}

if (require.main === module) {
  process.exit(process.argv[2] === "--selftest" ? selftest() : run());
}

module.exports = { DISPUTES, unmarked };
