# Before / after — test counts per file

Before: unmodified copy of `OmniSlack/omniecho-core` @ `848ae1a`, `node --test <file>`, 2026-10-26.
After: this folder, same command, same day (`evidence/2026-10-26/TESTS.txt`).

| Original file | Pass before | File here | Pass after | Note |
|---|---:|---|---:|---|
| `core.test.js` | 56 | `core.test.js` | 56 |  |
| `balancing.test.js` | 45 | `balancing.test.js` | 45 |  |
| `causal.test.js` | 16 | `causal.test.js` | 16 |  |
| `independence.test.js` | 15 | `independence.test.js` | 15 |  |
| `landauer.test.js` | 13 | `landauer.test.js` | 13 |  |
| `observer.test.js` | 20 | `observer.test.js` | 20 |  |
| `predict.test.js` | 15 | `predict.test.js` | 15 |  |
| `ablation.test.js` | 6 | `ablation.test.js` | 6 |  |
| `probe.test.js` | 12 | `adversarial-core-boundaries.test.js` | 12 |  |
| `probe2.test.js` | 17 | `adversarial-modules.test.js` | 17 |  |
| `probe3.test.js` | 6 | `adversarial-cumulative-limit.test.js` | 6 |  |
| `probe4.test.js` | 7 | `adversarial-permit-bounds.test.js` | 5 | S1–S5 (permit bounds) carried; S6–S7 test the text scanner `verify/text.js` and are not carried |
| `probe5.test.js` | 7 | `adversarial-caller-object-freeze.test.js` | 7 |  |
| `probe6.test.js` | 6 | — | — | all six test the text scanner `verify/text.js`; not carried (the scanner is not part of this folder) |
| `probe7.test.js` | 8 | `adversarial-solution-certificate.test.js` | 8 |  |
| `probe9.test.js` | 6 | `adversarial-cumulative-precision.test.js` | 6 |  |
| **Total** | **255** | | **247** | 255 − 2 (S6–S7) − 6 (probe6) = 247 |

All 247 carried tests pass. No assertion was removed or weakened: the number of `assert.*(` calls is identical file for file (117, 8, 37, 34, 39, 29, 59, 41, 24, 32, 16, 13, 20, 9), and 8 of the original 11 in `probe4.test.js` (the other 3 are in S6–S7). Where a test asserted on reason text, the same text was translated in the module and in the test.

Verify scripts, before → after:

| Script (before → here) | Before | After |
|---|---|---|
| `verify/ablation.js` → `verify/gate-ablation.js` | 31/31 baseline; 14 gates, every one with a non-zero drop | identical table, row for row |
| `verify/invariant.js 5` → `verify/action-lock-invariant.js 5` | 37,448 checks, 0 violations — **with the lock taken 0 times** (see README, defect history) | 37,448 checks, 0 violations, lock taken 18,398 times during the replays |
| `verify/procep.js` → `verify/reaction-gap-ddm.js` | numbers as printed | every number identical (compared by extracting all numerals) |
| `verify/timing.js` → `verify/cache-vs-work-timing.js` | recomputation 54.4×–55.8× a reuse (timing varies by run) | 55.1× in the recorded run; same conclusion |
| `verify/demo.js` → `verify/demo.js` | crash at step 3 | runs to the end, 10 steps |
