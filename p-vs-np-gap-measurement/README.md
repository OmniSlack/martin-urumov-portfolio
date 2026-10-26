# p-vs-np-gap-measurement

**Kind:** measurement script (Node.js ≥ 18, zero dependencies) · **Status:** illustration; resolves nothing · **Date:** 2026-09-19; English copy 2026-10-26

## Purpose

P versus NP asks whether every problem whose answer can be **checked** fast can also be **found** fast. This file does not try to answer that. It measures, on concrete instances, the gap the question is about: how the cost of finding an answer grows compared with the cost of checking one.

## How it works

The problem is **subset sum**: given n numbers and a target, find a subset that adds up to the target.

- **Instances** come from a deterministic xorshift32 generator (seed 20260919). The numbers are even. A subset is embedded on purpose, so the instance is known to have an answer. A second target, one higher and therefore odd, certainly has no answer.
- **Finding** is deliberately naive exhaustion over all 2^n subsets. Each subset costs n additions and 1 comparison, so a full exhaustion costs exactly 2^n·(n+1) steps.
- **Checking** adds up the certificate, which is the embedded subset, and compares it with the target: |certificate| + 1 steps, never more than n + 1.
- The code **counts steps, not only time**. Time depends on the machine; the step count does not.
- There are two finding columns. **Exhaustion** runs on the no-answer target; it is deterministic and always grows. **First hit** stops at the first answer found; where that answer sits is luck, so that column does not grow monotonically. The first version of the script plotted only the first-hit column, and that defect is recorded in the code.

## How to run

```bash
node p_vs_np_gap.js [max_n]    # default 22; max_n ≤ 30 (32-bit bitmask)
node --test                    # 6 tests
```

## Evidence

| Claim | Command | Observed 2026-10-26 (Node v22.23.4) |
|---|---|---|
| n = 8 → 22: exhaustion grows from 2,304 to 96,468,992 steps; checking from 4 to 9 | `node p_vs_np_gap.js` | `evidence/2026-10-26/AFTER.txt` |
| Exhaustion = 2^n·(n+1) exactly, for n = 4…16 | `node --test` | pinned |
| Checking = \|certificate\| + 1 ≤ n + 1 | `node --test` | pinned |
| First-hit steps are not monotone (n = 12: 13,572; n = 14: 3,915) | `node --test` | pinned |
| The no-answer target is never "found"; a wrong certificate is rejected | `node --test` | pinned |
| The English copy computes exactly what the original computed | `BASELINE.txt` vs `AFTER.txt` | all 58 numbers identical |
| 6/6 tests | `node --test` | `evidence/2026-10-26/TESTS.txt` |

## Limitations

- **It does not and cannot resolve P vs NP.** It measures one algorithm on one kind of instance. Exhaustion being slow says nothing about whether a fast algorithm exists, and proving P ≠ NP means ruling out every algorithm, including ones nobody has invented.
- Better algorithms for subset sum exist (dynamic programming, which is pseudo-polynomial in the size of the numbers, and meet-in-the-middle, about 2^(n/2)). The curve here is the curve of exhaustion, not of the problem.
- A "step" is this code's own unit (one addition or one comparison). It is not a formal machine model.
- n ≤ 30, because the subset mask is a 32-bit integer.

## Provenance

See [`PROVENANCE.md`](PROVENANCE.md). Source: `verify/pnp.js` in OmniSlack/omniecho-core at `848ae1a`. Comments, identifiers and output are translated from Bulgarian. Logic and numbers are unchanged.

## Contribution

- Martin Urumov: the question was posed by him.
- AI assistants: the choice of subset sum, the code, the tests, and the translation.
