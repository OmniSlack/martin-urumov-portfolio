"use strict";

/**
 * Defect #17 — the Core froze an object that was not its own.
 *
 * The fourth compositional class, searched for all day: loss of context
 * through a chain of hand-offs. Found in a place other than where it was
 * being looked for.
 *
 * The chain here is: the caller's proposal, a shallow copy in begin(), a deep
 * freeze of the copy. The freeze follows the shared references and leaves our
 * half of the chain for the caller's.
 *
 * Both consequences are serious, but the second is the quieter one:
 *
 *   1. The caller's object becomes immutable without the caller asking.
 *   2. The journal entry SHARES nested objects with the live proposal, i.e. it
 *      is not a snapshot. Had the freeze not reached that far, the record
 *      would change together with the original — after the action had ended.
 *
 * The same project forbids the first explicitly in observer.js, with test O12
 * behind it. The rule was enforced in one file and broken in the other.
 */

const test = require("node:test");
const assert = require("node:assert");
const { Core } = require("./core.js");

const PERMIT = { counterModelTested: true, humanPermit: "PRESENT", permitSignature: "S" };
const proposal = (details) => ({
  source: "doc", provenance: "signed", requiresTransition: true,
  targetSignature: "S", details,
});

test("T1. begin() does not freeze the caller's nested object", () => {
  const details = { amount: 100, recipient: "Ivan" };
  const p = proposal(details);
  const c = new Core();
  assert.ok(c.begin(c.evaluate(p, PERMIT), p), "the lock must be taken");
  assert.strictEqual(Object.isFrozen(details), false,
    "the caller's nested object must leave as free as it entered");
  assert.ok(Object.isExtensible(details));
});

test("T2. and the proposal itself stays free", () => {
  const p = proposal({ amount: 100 });
  const c = new Core();
  c.begin(c.evaluate(p, PERMIT), p);
  assert.strictEqual(Object.isFrozen(p), false);
  p.extra = "I can write";
  assert.strictEqual(p.extra, "I can write");
});

test("T3. writing to one's own object really works, it does not fail silently", () => {
  // The worst half of the defect: outside strict mode a write to a frozen
  // object passes without an error and changes nothing. A silent failure is
  // worse than a loud one.
  const details = { amount: 100 };
  const p = proposal(details);
  const c = new Core();
  c.begin(c.evaluate(p, PERMIT), p);
  details.amount = 1;
  assert.strictEqual(details.amount, 1,
    "the value must change; if it stays 100, the object was frozen");
});

test("T4. the journal entry is a SNAPSHOT, not a shared reference", () => {
  const details = { amount: 100 };
  const p = proposal(details);
  const c = new Core();
  const k = c.begin(c.evaluate(p, PERMIT), p);
  details.amount = 1000000;
  assert.strictEqual(c.actionInFlight.proposal.details.amount, 100,
    "the record keeps what WAS asked for, not what happened afterwards");
  c.complete(k, "done");
  c.release(k);
  assert.strictEqual(c.journal[0].proposal.details.amount, 100);
});

test("T5. and after release the record cannot be rewritten from outside", () => {
  const details = { amount: 100 };
  const p = proposal(details);
  const c = new Core();
  const k = c.begin(c.evaluate(p, PERMIT), p);
  c.release(k);
  details.amount = 7;
  details.added = "inserted afterwards";
  assert.strictEqual(c.journal[0].proposal.details.amount, 100);
  assert.strictEqual(c.journal[0].proposal.details.added, undefined,
    "nothing added after the action may appear in its record");
});

test("T6. the copy in the record stays frozen — it is ours", () => {
  const p = proposal({ amount: 100 });
  const c = new Core();
  c.begin(c.evaluate(p, PERMIT), p);
  const recorded = c.actionInFlight.proposal;
  assert.ok(Object.isFrozen(recorded), "our copy is frozen");
  assert.ok(Object.isFrozen(recorded.details), "including what is nested in it");
});

test("T7. a proposal with a function inside does not crash begin()", () => {
  // structuredClone does not transfer functions. Falling back to a shallow
  // copy is deliberate: a record missing one function is better than no record.
  const p = proposal({ amount: 100 });
  p.callback = () => "something";
  const c = new Core();
  assert.ok(c.begin(c.evaluate(p, PERMIT), p),
    "the lock must be taken even when the proposal carries a function");
});
