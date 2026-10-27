# ai-proposal-evaluator

**Kind:** library (JavaScript / Node.js ≥ 20, zero dependencies) · **Status:** candidate — in-process evaluator, verified locally; not deployed · **Date:** 2026-09-07 → 2026-10-13 (package v0.14.0); English edition and two harness fixes 2026-10-26

## Purpose

Decides, for one proposal made by an AI system (a claim, a confidence, a requested action), whether it may go ahead — `CLEAR`, must wait for a human or for more information — `HOLD`, or must not happen — `STOP`. The rule it enforces is fail-closed on missing information: an unknown source, an unanswered question, a confidence with nothing under it, a permit for a different action or a permit from the future are not treated as "probably fine"; they hold. It implements the authority-boundary design specification (v0.1): reasoning is free, but reasoning alone never grants the right to change state or to act.

## How it works

Terms used in the code, in plain words: **reaction gap** = the time in nanoseconds between receiving a proposal and returning a decision, with a timestamp for each check made in between; **Observer** = a record of one call (input, timing, returned object) sealed with SHA-256, with no write access to what it records; **mirrored observers** = two such records made independently and compared, plus one that checks their timings and one that checks whether the others were really independent.


`new Core().evaluate(proposal, context)` runs every gate on one severity ladder, `STOP > HOLD > CLEAR`, where `STOP` is terminal for that verdict. It returns a frozen object: `decision`, `reasons[]` (one sentence per gate that fired, prefixed `Gate NN Block:`), `provenance`, `reactionGapNs`, `reactionGapMarkers[]` (what was checked, and when), `timestamp`.

**16 gates return a refusal** — 14 in `core.js` and Gate 16 / Gate 17 in `predict.js` / `causal.js`:

```bash
grep -ohE "Gate [0-9]+ Block" core.js causal.js predict.js | sort -u | wc -l   # 16
grep -ohE "Gate [0-9]+ Block" core.js | sort -u | wc -l                         # 14
```

Documents elsewhere in the source repository give 17, 18 and 19; none of them matches the code. 16 is the number the command produces.

| Gate | Refuses when | Result |
|---|---|---|
| 12 | external execution is requested at all | STOP |
| 04 | the source or its provenance is unknown | HOLD |
| 03 | no counter-model check was done | HOLD |
| 08 | a production run is requested under simulation state | HOLD |
| 11 | a state transition has no present human permit, or the permit's signature does not match the target | HOLD |
| 09 | the permit is unreadable, expired, or dated in the future; the caller may narrow the age/skew bounds but never widen them, and any attempt to widen is recorded | HOLD |
| 14 | another action is already in flight (observation is never blocked) | HOLD |
| 13 | personal data is processed without a balancing assessment, or the assessment did not clear | HOLD / STOP |
| 15 | confidence is asserted without an evidence-independence assessment, or it did not clear | HOLD / STOP |
| 18 | a confidence is not a number in (0,1), or has no evidence / empty evidence | HOLD |
| 21 | confidence ≥ 0.9 — high confidence opens one more look, it never closes the question | HOLD |
| 20 | a solution is claimed without naming what it solves, without a certificate, without a verifier, or checking is not cheaper than searching | HOLD |
| 19 | the sum already executed plus the amount asked crosses a supplied cumulative limit (compensated summation; only executed actions count) | HOLD |
| 22 | the time between opening and returning is zero, or no checked step was named | HOLD |
| 16 (`predict.js`) | a prediction is edited after sealing, registered after the answer was available, or `observedAvailable` is not a boolean | STOP / HOLD |
| 17 (`causal.js`) | a causal link is claimed at a higher rung than its evidence reaches (UNKNOWN → CORRELATED → SUPPORTED → VERIFIED) | HOLD |

Action control on the same instance: `begin(verdict, proposal)` takes the single action lock only for a verdict **this** Core issued (a `WeakSet`, so a hand-written `{decision: "CLEAR"}` is refused) and only for the unchanged proposal it was issued for; `complete(key, outcome)` marks execution; `release(key)` appends a frozen record to an append-only `journal`. A record released without `complete()` keeps `executed: null` — proposed is not executed.

**Three layers added 2026-10-26** (carried from the source repository's commit `f36373e`; the rules come from the owner's own Python code of 2026-09-15):
1. **A verdict is a single-use ticket.** `begin()` marks the verdict spent when it is taken, not when the action finishes; the same verdict is refused a second time, even if the first action was abandoned. A new verdict for the same proposal still works.
2. **A protected action needs both a clean verdict and a matching permit.** The list of protected actions is given to the Core at construction (`new Core({ protectedActions })`), not declared by the proposal. The permit (`context.actionPermit`) must name who granted it and match `target`, `action` and `scope` exactly. A genuine permit does not rescue an unclean verdict. The refusal is named by what it does, not given a gate number, because it is a different check from Gate 11.
3. **"Verified" needs someone other than the Core.** `complete(key, "VERIFIED", { verifiedBy })` is refused without a named verifier, or when the verifier is `CORE`/`SELF`; the name is recorded. A plain completion needs no one.

Other modules: `severity.js` (the ladder, freeze routine and type guards — a string `"yes"` is not a boolean and holds), `observer.js` (a witness that records stimulus, gap and reaction, seals its own record with SHA-256 and has no write path to what it observes; `verifyObservation()` recomputes the seal), `balancing.js` (completeness of a GDPR Art. 6(1)(f) legitimate-interest assessment; an unanswered question holds), `independence.js` (confidence combined across distinct roots only — one source at 0.75 cited three times is worth 75.00 %, not 96.43 %), `predict.js`, `causal.js`, `landauer.js` (k_B·T·ln2 J per erased bit; refuses without a temperature), `mirror.js` (several observers on one call; flags identical timings as reuse).

## How to run

```bash
node --test                                   # 259 tests
node verify/gate-ablation.js                  # remove one gate at a time; every gate must change a decision
node verify/gate-ablation.js --selftest
node verify/action-lock-invariant.js 5        # every sequence of up to 5 operations, invariant checked after each step
node verify/reaction-gap-ddm.js               # the "gap" as drift-diffusion, simulation vs closed form
node verify/cache-vs-work-timing.js           # can a cached answer be told apart from work done
node verify/demo.js                           # ten functions in sequence, real outputs
```

No dependencies, no network, no filesystem writes outside the ablation's temporary file (removed after loading; test A6 checks it).

## Evidence

| Claim | Command | Observed 2026-10-26 (Node v22.23.4) |
|---|---|---|
| Original repository, unmodified copy: 255/255 | `node --test` at `848ae1a` | **Reproduced** |
| This folder: 247/247 (259/259 since the three layers, row below) | `node --test` | **Reproduced** — 8 tests of the original test the text scanner `verify/text.js`, which is not part of this folder; per-file table and assertion counts in [`BEFORE_AFTER.md`](BEFORE_AFTER.md) |
| Every gate in `core.js` has an independent contribution | `node verify/gate-ablation.js` | **Reproduced** — 31/31 baseline; 14 gates, each changes at least one case when removed; table identical to the original's |
| Gate 14 holds as an invariant to depth 5 | `node verify/action-lock-invariant.js 5` | **Reproduced** — 37,448 sequences, 0 violations, lock taken 18,398 times (see defect history: in the original this run took the lock 0 times) |
| With drift, a higher threshold is more accurate and slower; without drift accuracy stays at 50 % | `node verify/reaction-gap-ddm.js` | **Reproduced** — every printed number identical to the original's run |
| Recomputation is distinguishable from reuse | `node verify/cache-vs-work-timing.js` | **Reproduced** — 55.1× (varies by run; 54.4× and 55.8× in other runs) |
| The three layers close three measured gaps, and only them | `evidence/2026-10-27/THREE_LAYERS.txt` | **Reproduced 2026-10-27** — 259/259 here. The 12 new tests run against the previous `core.js`: **7 fail** (a verdict spent twice; a protected action passing with no permit or a permit for another target; "verified" with no verifier, by the Core, or not recorded) and **5 pass** (the reverse direction: a new verdict still works, an unprotected action needs no permit, a good permit does not rescue a bad verdict, a plain completion is unchanged). Same 7/5 split as in the source repository. Gate ablation still 31/31; invariant still 37,448 sequences, 0 violations |
| Gate count is 16 | the two `grep` lines above | **Verified** |

Raw outputs: [`evidence/2026-10-26/`](evidence/2026-10-26/).

## Defect history

From the original repository's version history (each with its regression test in the suite), plus the two found on 2026-10-26.

| Version / date | Defect | Fix |
|---|---|---|
| v0.2 | A `STOP` could be overwritten by a later `HOLD` (sequential assignment) | severity ladder `STOP > HOLD > CLEAR`, `STOP` terminal |
| v0.3 | D1: an unknown or missing source returned `CLEAR` — provenance was marked `UNVERIFIED` while the decision was left untouched | unknown provenance raises `HOLD` (Gate 04) |
| v0.3 | D2: Gate 08 (simulation vs execution) existed but had no test; the compliance matrix claimed tests that did not exercise it | tests for the blocked and the approved path |
| v0.4 | Fail-open: an unrecognised outcome from the balancing assessment (neither STOP, HOLD nor CLEAR) left the decision at `CLEAR` — caught before it shipped | unrecognised outcome falls to `HOLD` |
| v0.8 | Defect #1: the Observer's `self` entry was three literals — a file meant to see itself asserted that it did | every field derived from the call; a seal anyone can recompute; the claim narrowed to what can be checked |
| v0.8 | The Observer froze the reaction it observed (`deepFreeze` recursed into it) — changing what it watched | the Observer freezes only what it owns (test O12) |
| v0.10 | Defect #3: "proposed ≠ executed" existed only as a sentence; the two paths left identical state | `complete()`; `executed: null` on release without it |
| v0.13 | Defect #14: ten permitted transfers of 100 crossed a limit none of them crossed; and `lastAction` was one slot, so 9 of 10 actions left no record | Gate 19 (cumulative limit) and an append-only journal |
| 2026-09-18 | Defects #5 and #13: a hand-written `{decision: "CLEAR"}` opened the action lock; a verdict could be spent on a proposal changed after it was issued | verdicts tracked per instance; `begin()` requires the unchanged proposal |
| 2026-09-20 | Defect #21: naive summation in Gate 19 — 1000 × 0.1 summed to 99.9999999999986, letting one more action pass | Neumaier compensated summation (tests P1–P6) |
| **2026-10-26** | **`verify/demo.js` crashed at step 3.** It still called `begin(verdict)` with one argument after the #13 fix made the proposal mandatory; `begin` returned `null`. (Not, as first assumed, because of the earlier `STOP` on the same instance — measured: the verdict on that instance is `CLEAR`.) | the proposal is passed; the step calling a separate simulation outside this folder removed. Found by the AI assistant |
| **2026-10-26** | **The Gate 14 invariant check had become vacuous again.** Same call, same cause: `begin(verdict)` without the proposal, so in the original the lock was taken **0 times** across all 37,448 sequences and "0 violations" said nothing about Gate 14 — the exact failure the file's own comment describes for v0.11. | the proposal is passed (lock taken 18,398 times, still 0 violations) and the script now fails if the lock is never taken. Found by the AI assistant |

The original keeps a register of 165 defects (51 found by Martin Urumov, 114 by the AI tools); see `../defect-register/`.

## Limitations

- The three layers (2026-10-26) check that a permit and a verifier are NAMED and match; they do not check that either is genuine. The permit has no expiry or signature in this layer; a verifier called "Martin" is accepted without proof that Martin checked anything.
- One later change in the source repository is not carried: commit `d2a2e85` ("an unusable gap is a third state"). This folder is the source at `848ae1a` plus the three layers from `f36373e`, not the source's current state.

- In-process only: no persistence, no multi-process atomicity, no real action is ever executed. The action boundary is closed by construction (Gate 12 stops any external execution).
- It evaluates the shape of what it is given, not the truth of it: a well-formed claim with fabricated evidence passes the type guards. `causal.js` grades the design of the evidence, not whether the hypothesis is true.
- Several thresholds are the assistant's choices, not measured: 0.9 for Gate 21, 30 minutes / 1 minute for permit age and skew. They are marked as such in the code.
- Gate 22 proves that time passed and that steps were named, not that the named work was done.
- The invariant check is exhaustive only to the given depth, not a proof for every length.
- The Observer implements the core chain only (stimulus → gap → reaction); further sections of the source design (brackets and axes, capacity, levels) are not implemented.
- Identifiers kept in transliterated form: none — the four type-guard helpers, the clock option (`clock`) and the gap fields (`reactionGapNs`, `reactionGapMarkers[].step / .atNs`) were renamed in code and tests together.

## Provenance

See [`PROVENANCE.md`](PROVENANCE.md). Source: `OmniSlack/omniecho-core`, branch `claude/bro-6f3f37`, commit `848ae1a6264fb0cb31a99921a7fd569824e956ec` (2026-10-13). History: 222 commits, 2026-09-07 → 2026-10-13; 220 authored by "Claude", 2 by "omnivorous" (the owner's account) — `git log --format=%an | sort | uniq -c`. Every comment, string, reason text, test title and console output was translated from Bulgarian; the logic is unchanged. Not carried: the original's ~60 other `verify/` tools (repository maintenance, document generation, records of the work), its documents and HTML, the text scanner and its 8 tests, and a header in `observer.js` describing a personal conversation. **Update 2026-10-27:** the three layers of commit `f36373e5d97f46c2ab11f6b86fa9e8c27ae40394` (2026-10-26) were carried into `core.js` and `core.test.js` by hand, translated the same way; commit `d2a2e85` in between was not.

## Contribution

- Martin Urumov: the method and its requirements — fail-closed on missing information; `STOP > HOLD > CLEAR`; one action at a time with unbounded observation; evidence independence; a confidence needs evidence; proposed ≠ executed; a cumulative limit across permitted actions; the clock as an input and "a zero gap is itself a flag" (core.js, 2026-10-12); naming what the gap checks (2026-10-13); high confidence as a flag, not a seal; the growth threshold 0.67 used in the defect register; the minimal-model ablation method (2026-07-28); and 51 of the 165 registered defects (see `../defect-register/`); the three layers of 2026-10-26 — single-use ticket, both verdict and permit for a protected action, an independent verifier for "verified" — taken from his own code of 2026-09-15 and his instruction "carry the three layers into core.js".
- AI assistants (Claude Code, Codex): implementation of all modules and tests, the other 114 defect findings, and this English edition with the two 2026-10-26 fixes.
