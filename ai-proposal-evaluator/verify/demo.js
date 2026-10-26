"use strict";
/**
 * Ten functions, in sequence, each producing a real result.
 *
 * Not documentation. Every line below is the return value of a call made in
 * this run. If a function were broken, its line would be wrong or missing.
 *
 *     node verify/demo.js
 *
 * ⚠️ 2026-10-26: step 3 crashed (`Cannot read properties of null (reading
 * 'executed')`). Cause: since the fix for defect #13 (2026-09-18) `begin()`
 * requires the proposal the verdict was issued for as its second argument;
 * this script still called `begin(verdict)` with one argument, got `null`, and
 * `lastAction` stayed empty. The proposal is now passed. An eleventh step that
 * called a separate game-theory simulation (Keynes' beauty contest) is not
 * part of this folder and was removed.
 */
const { Core } = require("../core.js");
const { assess } = require("../balancing.js");
const { assessIndependence } = require("../independence.js");
const { predict, score } = require("../predict.js");
const { joulesPerBit } = require("../landauer.js");
const { Observer, verifyObservation } = require("../observer.js");
const { observeMirrored } = require("../mirror.js");

let n = 0;
const step = (name, output) => console.log(`${String(++n).padStart(2)}. ${name.padEnd(42)} ${output}`);

console.log("TEN FUNCTIONS, IN SEQUENCE — every output is from this run\n");

const c = new Core();

// 1 — a missing provenance does not pass
const r1 = c.evaluate({ mode: "PRODUCTION_RUN" }, {});
step("evaluate · no provenance", `${r1.decision} · ${r1.reasons.length} reasons`);

// 2 — STOP is terminal: external action + everything else fine
const r2 = c.evaluate({ source: "S", provenance: "P" }, { counterModelTested: true, triggerExternalAction: true });
step("evaluate · external action requested", `${r2.decision} ${r2.decision === "STOP" ? "· terminal" : ""}`);

// 3 — proposed ≠ executed
const proposal = { source: "S", provenance: "P", requiresTransition: true, targetSignature: "X" };
const ok = c.evaluate(proposal,
  { counterModelTested: true, humanPermit: "PRESENT", permitSignature: "X" });
const key = c.begin(ok, proposal); c.release(key);
step("begin → release without complete", `executed: ${c.lastAction.executed}`);

// 4 — a permit from the future
const tomorrow = new Date(Date.now() + 864e5).toISOString();
const r4 = c.evaluate({ source: "S", provenance: "P", requiresTransition: true, targetSignature: "X" },
  { counterModelTested: true, humanPermit: "PRESENT", permitSignature: "X", permitTimestamp: tomorrow });
step("evaluate · permit dated tomorrow", `${r4.decision} · "${(r4.reasons.find(x => /future/.test(x)) || "").slice(17, 52)}"`);

// 5 — a balancing assessment with nothing in it
step("balancing.assess({})", `${assess({}).decision}`);

// 6 — three pieces of evidence, one root
const ind = assessIndependence([
  { id: "a", confidence: 0.75, source: "S1", provenance: "p" },
  { id: "b", confidence: 0.75, source: "S2", provenance: "p", derivedFrom: "a" },
  { id: "c", confidence: 0.75, source: "S3", provenance: "p", derivedFrom: "b" }]);
step("independence · 3 items, 1 root", `${ind.roots.length} root · ${ind.decision} · honest ${(ind.honestConfidence*100).toFixed(2)}%`);

// 7 — a prediction without an observation
const p = predict({ id: "P", quantity: "mass", value: 10, unit: "kg", tolerance: 0.05, method: "scale", observedAvailable: false });
step("predict → score without observation", `${score(p, undefined).decision} · hit: ${score(p, undefined).hit}`);

// 8 — Landauer refuses an impossible temperature
let l8; try { l8 = joulesPerBit(0); } catch (e) { l8 = e.constructor.name; }
step("landauer.joulesPerBit(0 K)", `${l8} · at 300 K: ${joulesPerBit(300).toExponential(3)} J/bit`);

// 9 — the observer is checked
const o = new Observer();
const st = { source: "S", provenance: "P" };
const rec = o.observe(st, () => c.evaluate(st, { counterModelTested: true }));
const v = verifyObservation(rec);
step("observer → verifyObservation", `valid: ${v.valid} · reason: ${v.reason}`);

// 10 — the mirror catches reuse
const cached = c.evaluate(st, { counterModelTested: true });
step("mirror · one answer, three coats", `${observeMirrored(st, () => cached).decision}`);

console.log(`\n${n} functions. Each returned a value in this run.`);
