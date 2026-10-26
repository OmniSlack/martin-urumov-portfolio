# Equal-length control probe — 2026-10-26

The first probe ([`../eval/`](../eval/)) found one effect: on T3 (five physical values), `measured-values-report` raised the score from 10/15 to 15/15. It could not say whether the skill's **content** did that, or just a **longer, stricter prompt**. This probe adds a control: a different instruction of the same length.

## What was done

- The plan, the control text and all 15 prompts were written first and hashed before any run: [`PLAN.md`](PLAN.md), [`control-skill.md`](control-skill.md), [`LOCK.txt`](LOCK.txt) (locked 08:45:02 UTC).
- T3 only, task text unchanged. 15 new runs, 5 per condition, each by a fresh Claude Sonnet subagent with its own folder:
  - **without**: the task only;
  - **with**: the skill (858 words) before the task;
  - **control**: a style guide on tables, number formatting, units and length (887 words). It contains none of the skill's key words and none of the five values.
- The **with** and **without** prompts are byte-identical to the first probe's (same SHA-256, `d70c2574…` and `701af0d9…`). Prompts are in `runs/<id>.prompt.md`, answers in `runs/<id>.answer.md`.
- Blind grading. The 15 answers were shuffled (seed 5151) and labelled A–O. One grader, a subagent on the session's default model, saw only the task, the unchanged 5-item rubric and the answers, and gave yes/no plus a quote for every item. The packet is [`grading/T3.md`](grading/T3.md), the grades are [`grading/T3.grades.json`](grading/T3.grades.json), and the key is [`grading/KEY.json`](grading/KEY.json), applied afterwards.

## Result

`python3 score.py` → [`RESULTS.txt`](RESULTS.txt)

| rubric item | without | control | with |
|---|---|---|---|
| 1 every value has an origin label, not only a source | 0/5 | 0/5 | 5/5 |
| 2 speed of light exact by definition | 5/5 | 5/5 | 5/5 |
| 3 Hawking temperature theoretical / never observed | 5/5 | 3/5 | 5/5 |
| 4 M87* value from a model fitted to data | 1/5 | 0/5 | 5/5 |
| 5 year given without an uncertainty | 4/5 | 0/5 | 5/5 |
| **total** | **15/25** | **8/25** | **25/25** |

Decision rule fixed in advance: an effect needs a difference of at least 4 of 25.

- **with − control = +17.** 🟢 The skill's content shows an effect. A long, strict instruction of the same length did not produce it.
- **control − without = −7.** 🟢 Length alone shows no effect. The control did **worse** than no instruction at all, mostly on item 5: all five control answers wrote `0` in the uncertainty cell for the year, and none of the five tied the M87* value to a model.
- **without** scored 15/25 here and 10/15 in the first probe: 60 % and 67 %, a consistent baseline.

## Checked by hand

I read all 15 answers against the grader's 75 item grades and agreed with every one. The grader listed its own close calls, and I agreed with each:
- item 1 for the year row, where "n/a" or "record" counted as a label;
- item 4 for one *without* answer ("depends on the EHT's modelling"), counted as met;
- item 5, where "None (historical fact)" passes and a bare `0` fails.

## Limitations

- n = 5 per cell, one task, one model, no significance test. This describes 15 answers. It is not an estimate for the model in general.
- **The control is one text, and it was not neutral.** It was written by the same assistant after seeing the first probe's result. It turned out to steer answers in its own direction: "every number has a unit" and "one kind of content per column" plausibly pushed the `0` into the year cell and kept comments out of cells. So "control < without" says this style guide hurt on this rubric. It does not say every long instruction would. A different control of the same length could score anywhere between.
- The grader is a model. Blinding is partial: the skill asks for a marker column and an origin column, which a reader can see.
- The skill was given in the prompt, not loaded through the Skill tool.
- The grader left a helper script (`mk.py`) in its scratch folder. It is not carried; the grades file it wrote is.
