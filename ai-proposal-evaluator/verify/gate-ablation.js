"use strict";

/**
 * MINIMAL MODEL TEST — applied to the gates
 *
 * SOURCE. Martin Urumov, `05_MINIMAL_MODEL_TEST.md`, 28 July 2026. That file
 * defines baselines A0–A4, six scenarios, one survival condition and an
 * "Ablations" section whose last sentence is the whole reason this instrument
 * exists:
 *
 *   "Remove the components one at a time.
 *    A COMPONENT WITHOUT AN INDEPENDENT CONTRIBUTION IS DROPPED."
 *
 * WHY THIS WAS MISSING HERE
 *
 * The repository had 202 tests and every one of them proved that some gate
 * FIRES. None proved that the gate is NEEDED. These are different things, and
 * the difference is exactly the one that file names:
 *
 *   a gate that fires                        — does something
 *   a gate with an independent contribution  — does something NO OTHER gate does
 *
 * Fourteen checks can pass while one of them is completely shadowed by another
 * — and then it guards nothing and only adds a line to the report. That is the
 * same defect class as #16: something that LOOKS like a safeguard.
 *
 * HOW IT WORKS
 *
 * A copy of `core.js` is made in which ONE gate is disabled: each of its
 * `updateDecision(...)` calls becomes a no-op, while the reason text stays, so
 * that nothing else changes. The whole scenario corpus then runs through the
 * full code and through the disabled copy, and the DECISIONS are compared.
 *
 * SURVIVAL CONDITION, SET IN ADVANCE
 *
 * The requirement, verbatim: "a utility function defined in advance, under the
 * same maximum budget". Here:
 *
 *   utility = the number of cases in which the decision matches the EXPECTED one
 *   budget  = equal by construction: every variant sees the same corpus
 *
 * The expected decisions are in the table BELOW, written before the run. The
 * full code must get all of them; if it does not, the corpus is wrong, not the
 * gate, and the instrument stops instead of reporting.
 *
 * A gate whose removal changes NOT A SINGLE decision is DROPPED under that
 * rule. That is a finding, not an error — and it is printed as a finding.
 *
 *     node verify/gate-ablation.js
 *     node verify/gate-ablation.js --selftest
 *
 * ⚠️ THE BOUNDARY. This measures contribution RELATIVE TO THIS CORPUS. A gate
 * that drops here is not proven useless — it is proven that these scenarios do
 * not distinguish it. The converse is stronger: a gate with a contribution here
 * is a gate that certainly guards something no other gate guards.
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const CORE = path.join(ROOT, "core.js");

// ───────────────────────────────────────────────────────────────────────────
// Disabling ONE gate
// ───────────────────────────────────────────────────────────────────────────

/**
 * Every `updateDecision(` in `evaluate` belongs to the gate whose `Gate NN`
 * appears in the following lines. Checked: every `reasons.push` in that file
 * starts with "Gate NN Block:" at most on the second line after it.
 *
 * Disabling replaces ONLY `updateDecision` with an empty function. The reason
 * is recorded as before — so the difference measured is purely the decision,
 * not a side effect of a shorter output.
 */
function ablate(source, gate) {
  const lines = source.split("\n");
  let touched = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!/\bupdateDecision\(/.test(lines[i])) continue;
    let owner = null;
    for (let j = i; j < Math.min(i + 6, lines.length); j++) {
      const m = lines[j].match(/Gate (\d+)/);
      if (m) { owner = m[1].replace(/^0+/, ""); break; }
    }
    if (owner === String(gate)) {
      lines[i] = lines[i].replace(/\bupdateDecision\(/g, "ABLATED(");
      touched++;
    }
  }
  if (!touched) return null;
  // The no-op is inserted next to the real one so that the file still loads.
  const out = lines.join("\n").replace(
    /(\n\s*)(const updateDecision|function updateDecision)/,
    "$1const ABLATED = () => {};$1$2"
  );
  return { source: out, touched };
}

/** Which gates live in core.js at all. */
function gatesInCore(source) {
  const seen = new Set();
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/\bupdateDecision\(/.test(lines[i])) continue;
    for (let j = i; j < Math.min(i + 6, lines.length); j++) {
      const m = lines[j].match(/Gate (\d+)/);
      if (m) { seen.add(m[1].replace(/^0+/, "")); break; }
    }
  }
  return [...seen].sort((a, b) => Number(a) - Number(b));
}

let tmpSeq = 0;
function loadVariant(source) {
  // The file is written INTO the folder because `core.js` requires ./severity.js etc.
  const p = path.join(ROOT, `.ablation-${process.pid}-${tmpSeq++}.tmp.js`);
  fs.writeFileSync(p, source);
  try {
    delete require.cache[require.resolve(p)];
    return require(p);
  } finally {
    fs.unlinkSync(p);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// THE SIX SCENARIOS — from the source file, carried into this domain
// ───────────────────────────────────────────────────────────────────────────

/**
 * COMMON BASE. Gate 03 requires a counter-model check on EVERY proposal, so it
 * is in every context. The first attempt lacked this and the full code got
 * 8 of 21 — the instrument refused to report and pointed at the corpus. That is
 * the right behaviour: when the baseline is not clean, there is nothing to measure.
 */
const BASE = { counterModelTested: true };

/** A permit in the PAST. The first attempt dated it today and Gate 09
 *  correctly rejected it as "not yet valid". A second corpus error. */
const PERMIT = {
  ...BASE,
  humanPermit: "PRESENT",
  permitSignature: "S",
  // Computed, not written: a permit from five minutes ago. The first attempt
  // used a fixed date and after a while Gate 09 correctly declared it expired —
  // a fixture that the calendar breaks is a fixture that lies.
  permitTimestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
};
const OK = { source: "doc", provenance: "signed", targetSignature: "S" };

/**
 * `expect` was written BEFORE the run and is not touched according to what
 * comes out. This is the only part of the file that must not be "fixed" to pass.
 */
const CASES = [
  // 1 · Pure noise — nothing is claimed, nothing is asked.
  { id: "1.1", scen: "pure noise", expect: "CLEAR", p: { ...OK }, c: { ...BASE } },
  { id: "1.2", scen: "pure noise", expect: "CLEAR",
    p: { ...OK, note: "no claim" }, c: { ...BASE } },

  // 2 · Useful history — the permit is present and matches.
  { id: "2.1", scen: "useful history", expect: "CLEAR",
    p: { ...OK, requiresTransition: true }, c: { ...PERMIT } },
  { id: "2.2", scen: "useful history", expect: "CLEAR",
    p: { ...OK, confidence: 0.7, evidence: ["measured"] }, c: { ...BASE } },

  // 3 · Misleading history / distribution shift — a permit for one thing,
  //     spent on another; missing; no provenance; expired.
  { id: "3.1", scen: "misleading history", expect: "HOLD",
    p: { ...OK, requiresTransition: true, targetSignature: "OTHER" },
    c: { ...PERMIT } },
  { id: "3.2", scen: "misleading history", expect: "HOLD",
    p: { ...OK, requiresTransition: true },
    c: { ...PERMIT, humanPermit: "ABSENT" } },
  { id: "3.3", scen: "misleading history", expect: "HOLD",
    p: { source: "doc" }, c: { ...BASE } },
  { id: "3.4", scen: "misleading history", expect: "HOLD",
    p: { ...OK, requiresTransition: true },
    c: { ...PERMIT, permitTimestamp: "not a date" } },

  // 4 · Same information, different framing — EXACTLY defect #16.
  //     The same action: once with an object that SAYS "approved",
  //     once with a real permit.
  { id: "4.1", scen: "framing", expect: "HOLD",
    p: { ...OK, requiresTransition: true },
    c: { ...PERMIT, humanPermit: { approved: true, status: "PRESENT" } } },
  { id: "4.2", scen: "framing", expect: "HOLD",
    p: { ...OK, mode: "PRODUCTION_RUN" },
    c: { ...PERMIT, productionApproved: false } },
  { id: "4.3", scen: "framing", expect: "CLEAR",
    p: { ...OK, mode: "PRODUCTION_RUN" },
    c: { ...PERMIT, productionApproved: true } },
  // ⚠️ 0.7, NOT 0.9 — corrected 2026-10-12 together with the arrival of Gate 21.
  // They were at 0.9 and so raised BOTH 18 and 21; then removing either one
  // changed nothing and the ablation declared BOTH redundant. They were not
  // redundant — the case that separates them was missing. That is outcome (b),
  // which the instrument itself names and refuses to decide on its own.
  { id: "4.4", scen: "framing", expect: "HOLD",
    p: { ...OK, confidence: 0.7 }, c: { ...BASE } },
  { id: "4.5", scen: "framing", expect: "HOLD",
    p: { ...OK, confidence: 0.7, evidence: [] }, c: { ...BASE } },
  // Gate 21 only: confidence is HIGH but evidence is present —
  // so Gate 18 has nothing to catch. "A flag, not a seal."
  { id: "4.6", scen: "framing", expect: "HOLD",
    p: { ...OK, confidence: 0.95, evidence: ["measured"] }, c: { ...BASE } },
  // Gate 22 only: everything is fine, but the clock is frozen — the gap is
  // zero, so nothing happened between opening and returning.
  { id: "4.7", scen: "the gap", expect: "HOLD",
    clock: () => 7n,
    p: { ...OK }, c: { ...BASE } },

  // 5 · High cost of delay — the delay hurts and the answer is still HOLD.
  //     If any gate yields under pressure, it shows here.
  { id: "5.1", scen: "cost of delay", expect: "HOLD",
    p: { ...OK, requiresTransition: true, urgency: "CRITICAL", costOfDelay: 1e9 },
    c: { ...PERMIT, humanPermit: "ABSENT" } },
  { id: "5.2", scen: "cost of delay", expect: "STOP",
    p: { ...OK, urgency: "CRITICAL" },
    c: { ...BASE, triggerExternalAction: true } },
  { id: "5.3", scen: "cost of delay", expect: "HOLD",
    p: { ...OK, requiresTransition: true, urgency: "CRITICAL" },
    c: { ...PERMIT, counterModelTested: false } },

  // 6 · Multi-agent cascade — each permitted alone, together over the edge.
  { id: "6.1", scen: "cascade", expect: "CLEAR",
    p: { ...OK, amount: 10 },
    c: { ...BASE, cumulativeLimit: 100, cumulativeField: "amount" } },
  // Gate 19 reads the JOURNAL of what was executed, not a field in the context.
  // The first attempt supplied an invented `spentSoFar` and got CLEAR — the gate
  // was right, the corpus wrong. Here ninety-five is really spent.
  { id: "6.2", scen: "cascade", expect: "HOLD",
    pre: (core) => {
      const p = { ...OK, amount: 95 };
      const c = { ...BASE };
      const k = core.begin(core.evaluate(p, c), p);
      core.complete(k, "done");
      core.release(k);
    },
    p: { ...OK, amount: 10 },
    c: { ...BASE, cumulativeLimit: 100, cumulativeField: "amount" } },
  { id: "6.3", scen: "cascade", expect: "HOLD",
    p: { ...OK },
    c: { ...BASE, cumulativeLimit: 100, cumulativeField: "amount" } },

  // 7 · A claimed solution — Gate 20, from the same conversation.
  { id: "7.1", scen: "claimed solution", expect: "HOLD",
    p: { ...OK, solves: "P vs NP" }, c: { ...BASE } },
  { id: "7.2", scen: "claimed solution", expect: "CLEAR",
    p: { ...OK, solves: "subset-sum, n=22", certificate: "the subset",
         verifier: "add and compare", verificationCost: 9, searchCost: 96468992 },
    c: { ...BASE } },
  { id: "7.3", scen: "claimed solution", expect: "HOLD",
    p: { ...OK, solves: "X", certificate: "c", verifier: "v",
         verificationCost: 100, searchCost: 10 },
    c: { ...BASE } },
  // 8 · THE THREE CASES THE FIRST CORPUS DID NOT HAVE
  //
  // The first run gave a drop of ZERO for gates 13, 14 and 15 — so under the
  // 05_MINIMAL_MODEL_TEST rule they were to be dropped. The cause was not in
  // them, though: the corpus had not one proposal with personal data, not one
  // with an action already in flight and not one that ASSERTS confidence. Three
  // gates were about to be declared redundant because nobody had asked them.
  //
  // This is the most important thing the instrument showed about itself:
  // ablation measures the corpus exactly as much as it measures the code. The
  // old finding is kept visible in the history rather than deleted.
  { id: "8.1", scen: "personal data", expect: "HOLD",
    p: { ...OK, processesPersonalData: true }, c: { ...BASE } },
  { id: "8.2", scen: "personal data", expect: "HOLD",
    p: { ...OK, processesPersonalData: true },
    c: { ...BASE, balancingOutcome: { decision: "HOLD" } } },
  { id: "8.3", scen: "personal data", expect: "CLEAR",
    p: { ...OK, processesPersonalData: true },
    c: { ...BASE, balancingOutcome: { decision: "CLEAR" } } },

  { id: "8.4", scen: "action in flight", expect: "HOLD",
    pre: (core) => {
      const p = { ...OK, requiresTransition: true };
      const c = { ...PERMIT };
      core.begin(core.evaluate(p, c), p);   // takes the lock and does not release it
    },
    p: { ...OK, requiresTransition: true }, c: { ...PERMIT } },

  { id: "8.5", scen: "independence", expect: "HOLD",
    p: { ...OK, assertsConfidence: true }, c: { ...BASE } },
  { id: "8.6", scen: "independence", expect: "HOLD",
    p: { ...OK, assertsConfidence: true },
    c: { ...BASE, independenceOutcome: { decision: "HOLD" } } },
  { id: "8.7", scen: "independence", expect: "CLEAR",
    p: { ...OK, assertsConfidence: true },
    c: { ...BASE, independenceOutcome: { decision: "CLEAR" } } },
];


function utility(Core, cases) {
  let hit = 0;
  const got = [];
  for (const k of cases) {
    let d;
    try {
      // ⚠️ The `clock` is supplied by the case, 2026-10-12. Without it Gate 22
      // (the gap) is unreachable from the corpus: with a real clock the gap is
      // always > 0, so the gate never changes a decision and the ablation would
      // declare it redundant — true for what it looks at, false for the gate.
      const core = new Core(k.clock ? { clock: k.clock } : {});
      if (k.pre) k.pre(core);
      d = core.evaluate(structuredClone(k.p), structuredClone(k.c)).decision;
    } catch (e) {
      d = `ERROR: ${e.message}`;
    }
    got.push(d);
    if (d === k.expect) hit++;
  }
  return { hit, got };
}

// ───────────────────────────────────────────────────────────────────────────

function selftest() {
  const src = fs.readFileSync(CORE, "utf8");
  let bad = 0;
  const say = (ok, what) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
    if (!ok) bad++;
  };

  // S1 — disabling really changes the code.
  const a = ablate(src, 8);
  say(a && a.touched > 0, "S1. disabling gate 08 changes at least one line");
  say(a && !/\bupdateDecision\(/.test(a.source.slice(
        a.source.indexOf("Gate 08") - 400, a.source.indexOf("Gate 08"))),
      "S1b. right before gate 08 there is no updateDecision any more");

  // S2 — the disabled file still loads and runs.
  let M = null;
  try { M = loadVariant(a.source); } catch (e) { /* fails at S2 */ }
  say(M && typeof M.Core === "function", "S2. the disabled core.js loads");

  // S3 — and it really is weaker: case 4.2 passes where it must not.
  if (M) {
    const k = CASES.find((x) => x.id === "4.2");
    // The reason DELIBERATELY stays — only the decision is removed. The first
    // version of this check looked at the text and failed through its own fault.
    const mc = new M.Core();
    if (k.pre) k.pre(mc);
    const r = mc.evaluate(structuredClone(k.p), structuredClone(k.c));
    say(r.decision !== k.expect,
        `S3. without gate 08 case 4.2 gives ${r.decision} instead of ${k.expect}`);
  } else say(false, "S3. skipped — S2 failed");

  // S4 — a non-existent gate changes nothing.
  say(ablate(src, 999) === null, "S4. a gate that does not exist is not touched");

  // S5 — the corpus is not tautological: it contains all three decisions.
  const kinds = new Set(CASES.map((c) => c.expect));
  say(kinds.size === 3, `S5. the corpus requires all three decisions (${[...kinds].join(", ")})`);

  console.log(bad ? `\n${bad} failed.` : "\nall pass.");
  process.exit(bad ? 1 : 0);
}

if (require.main === module && process.argv.includes("--selftest")) selftest();

// ───────────────────────────────────────────────────────────────────────────

module.exports = { ablate, gatesInCore, loadVariant, utility, CASES };

if (require.main !== module) return;

  const src = fs.readFileSync(CORE, "utf8");
  const { Core } = require(CORE);

  const base = utility(Core, CASES);

  console.log("MINIMAL MODEL TEST — the gates of core.js");
  console.log("Method: 05_MINIMAL_MODEL_TEST.md, Martin Urumov, 28 July 2026\n");
  console.log(`Corpus: ${CASES.length} cases, expectations written before the run.`);
  console.log(`Budget: equal by construction — every variant sees the same corpus.\n`);

  if (base.hit !== CASES.length) {
    console.log(`THE FULL CODE gets ${base.hit}/${CASES.length}. The corpus is wrong,`);
    console.log("not the gates. Mismatches:\n");
    CASES.forEach((k, i) => {
      if (base.got[i] !== k.expect)
        console.log(`  ${k.id}  ${k.scen.padEnd(22)} expected ${k.expect}, got ${base.got[i]}`);
    });
    console.log("\nNothing is reported until the baseline is clean.");
    process.exit(1);
  }
  console.log(`Full code: ${base.hit}/${CASES.length}. The baseline is clean.\n`);

  const gates = gatesInCore(src);
  const rows = [];
  for (const g of gates) {
    const a = ablate(src, g);
    if (!a) continue;
    let r;
    try {
      r = utility(loadVariant(a.source).Core, CASES);
    } catch (e) {
      rows.push({ g, drop: null, err: e.message, cases: [] });
      continue;
    }
    const changed = CASES.filter((k, i) => r.got[i] !== base.got[i]);
    rows.push({
      g,
      drop: base.hit - r.hit,
      cases: changed.map((k, j) => `${k.id} ${k.expect}→${r.got[CASES.indexOf(k)]}`),
    });
  }

  const w = Math.max(...rows.map((r) => r.cases.join(", ").length), 20);
  console.log("gate  drop  changed cases");
  console.log("────  ────  " + "─".repeat(Math.min(w, 60)));
  for (const r of rows) {
    if (r.err) { console.log(`  ${r.g.padStart(2)}    —    does not load: ${r.err}`); continue; }
    console.log(`  ${String(r.g).padStart(2)}   ${String(r.drop).padStart(3)}   ${r.cases.join(", ") || "— nothing —"}`);
  }

  const dead = rows.filter((r) => r.drop === 0);
  console.log("");
  if (dead.length === 0) {
    console.log("Every gate in core.js has an independent contribution relative to this corpus.");
    console.log("No gate can be removed without it being noticed.");
  } else {
    console.log(`DROPPED under the 05_MINIMAL_MODEL_TEST rule: ${dead.map((r) => r.g).join(", ")}`);
    console.log("");
    console.log("Removing them changes no decision. That means one of two things,");
    console.log("and the difference matters:");
    console.log("  a) the gate is completely shadowed by another — then it is a line");
    console.log("     in the report, not a safeguard, and it goes;");
    console.log("  b) the corpus lacks the case only this gate catches — then the case");
    console.log("     is missing, it is added here, and the gate stays.");
    console.log("");
    console.log("The instrument cannot decide which of the two it is. That is a human decision.");
  }

  console.log("");
  console.log("⚠️ Scope: only the gates in core.js. Gate 17 (causal.js) and the");
  console.log("   assessments in balancing.js / independence.js are called FROM here,");
  console.log("   but live elsewhere and are not disabled by this instrument.");
