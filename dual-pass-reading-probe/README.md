# dual-pass-reading-probe

**Kind:** experiment (Python scoring, Claude Sonnet subagents as readers) · **Status:** first run done; result is a ceiling · **Date:** 2026-10-26

## Purpose

Tests one step of a reading method for AI agents. An agent reads a batch of files. A second agent then reads the same batch from scratch, in **reverse order**, with no memory of the first pass, and the two results are compared only afterwards. The question is whether reverse order, and checkpoints in the middle and at the end of each pass, catch entries that a single pass misses.

The method is Martin Urumov's (stated 2026-10-26): read a portion; read it again independently and in reverse order; if the two agree, the portion was within capacity and the next one can be larger; if they disagree, it was too much. Checkpoints in the middle and at the end leave no "middle" without a checkpoint. Only the first step, whether the second pass catches more, is tested here. Changing the portion size is not.

Related practice, named so the method is not presented as new in its parts:
- running a model several times and comparing the answers ("self-consistency");
- test-retest reliability in psychometrics;
- TCP congestion control, which grows the amount sent while nothing is lost and cuts it when something is.

## How it works

- `make_material.py` (seed 20261026) writes 5 log files of 400 entries each. Every entry gives a reading and that unit's limit, and every status field says "ok".
  - 20 entries exceed their limit: 4 per file, one near the start, two in the middle, one near the end.
  - 40 entries are near-misses, 7 of them exactly at the limit.
  - The key is `ANSWER_KEY.json`. It was checked by a second, independent parse: 20 over, 7 equal.
- Each pass is a fresh Claude Sonnet subagent with its own copy of the files and no key. It may use only the Read tool: no grep, no code.
- There are four kinds of pass, 5 runs each:
  - **F**: forward, files 1 to 5;
  - **R**: reverse, files 5 to 1;
  - **FC** and **RC**: the same, writing a checkpoint after the third file and after the last.
- Prompts are in `runs/<id>.prompt.md`, answers in `runs/<id>.answer.md`, checkpoints in `runs/<id>.checkpoint-<n>.md`.
- The plan, the material, the key and all prompts were hashed before any run: [`PLAN.md`](PLAN.md), [`LOCK.txt`](LOCK.txt) (09:33:11 UTC).

## How to run

```
python3 make_material.py     # regenerates material/ and ANSWER_KEY.json; byte-identical to LOCK.txt
python3 score.py             # scores every pass and the four combinations
sha256sum -c LOCK.txt        # all OK; one warning for the header line, which is not a hash
```

## Evidence

| Claim | Command | Observed |
|---|---|---|
| Every pass found all 20 exceedances, with no false positives | `python3 score.py` | 20 passes × 20/20; 0 false positives; the 7 entries equal to their limit were never listed |
| One pass, two same-order passes, forward + reverse, and both with checkpoints all score the same | `python3 score.py` | A = B = C = D = 100/100 |
| The pre-registered rule says the material was too easy | `results/RESULTS.txt` | "A >= 95: the material was too easy; no difference can be shown." |

## Result

🟢 **On this material, a second pass in any order adds nothing, because the first pass already missed nothing.** This is a ceiling. It does **not** show that reverse order or checkpoints are useless. It shows that 2000 short, uniform lines are well within one pass's capacity for this model. The effect, if there is one, can only appear on material where single passes miss things.

🟡 **One thing noticed, not scored.** Pass RC5 listed the right 20 entries, but its note gave line 366 of file 4 as an example of a reading "equal" to the limit. The line reads 123.3 against 123.5: below the limit, not equal. The list was right and the explanation beside it was wrong. That is the second kind of error this method does not target: a misreading, not a miss. It was noticed after scoring and is not part of the result.

## Limitations

- One model, one kind of synthetic material, n = 5 per pass type.
- At a ceiling, no comparison between the conditions is possible.
- "Same order" pairs reuse forward runs, so they are not independent of A.
- The rule "use only the Read tool" was given, but whether every pass followed it was not checked from the agents' tool logs. Each pass reported 7 or 9 tool calls, which matches 5 reads plus the writes.

## Next step

Material on which single passes do miss:
- more and longer files;
- exceedances smaller than the rounding the eye does (e.g. 45.04 against 45.0);
- mixed units;
- entries where the limit is stated far from the reading.

Plus a fifth kind of pass suggested on 2026-10-26: start in the middle and read out to both ends. Each needs its own plan, locked before the runs.

## Provenance

Everything in this folder was written on 2026-10-26 for this repository. There is no earlier original.

## Contribution

| | Martin Urumov | AI assistant |
|---|---|---|
| The method: independent second pass, reverse order, checkpoints in the middle and at the end, portion size set by agreement | yes | — |
| Material, plan, prompts, scoring, this README | — | yes |
| Naming the related practice; pointing out that two passes of one model can agree on a misreading | — | yes |
| The 20 reading passes | — | Claude Sonnet subagents |
