# Skill effect probe — 2026-10-26

Does giving an agent one of the skills change what it reports, on a task where the skill applies?

## What was done

- The plan, the five tasks, the rubric and the decision rule were written first and hashed before any run: [`PLAN.md`](PLAN.md), hashes and time in [`LOCK.txt`](LOCK.txt) (locked 06:23:39 UTC).
- 30 runs: 5 tasks × 2 conditions × 3. A fresh Claude Sonnet subagent ran each one, on its own copy of the materials. In the **with** condition the full English `SKILL.md` came before the task text. In the **without** condition only the task text was given. Every prompt is in `runs/<id>.prompt.md` and every answer in `runs/<id>.answer.md`.
- Blind grading: for each task the 6 answers were shuffled (seed 4242) and labelled A–F. One grader (a subagent on the session's default model) saw only the task, the rubric and the answers, and gave yes/no plus a quote for each item. The packets are in `grading/T*.md`, the grades in `grading/T*.grades.json`, and the key, applied afterwards, in `grading/KEY.json`.

## Result

`python3 score.py` → [`RESULTS.txt`](RESULTS.txt)

| Task (skill) | without | with | difference | effect shown (≥ 3, fixed in advance)? |
|---|---|---|---|---|
| T1 partial audit (report-scope) | 12/12 | 12/12 | 0 | no |
| T2 two empty results (distinguishing-observation) | 12/12 | 12/12 | 0 | no |
| T3 five physical values (measured-values-report) | 10/15 | 15/15 | +5 | **yes** |
| T4 port and compare (reimplementation-check) | 15/15 | 15/15 | 0 | no |
| T5 build status (claim-discipline) | 15/15 | 15/15 | 0 | no |

**An effect was shown on one task of five.** In T3, without the skill all three answers called the 42 µas M87* figure "the measured ring". With the skill all three labelled it as derived from a model fitted to the data, and gave every value an origin label. Without the skill, two of three gave the electron mass only a source (CODATA), not an origin.

**On the other four tasks this probe cannot tell.** The model without the skill already met every rubric item, so neither condition could score higher. That is a ceiling: the rubric measured behaviour the model already had. It does **not** show that those skills have no effect. It shows that these tasks were too easy to reveal one.

## Checked by hand

I compared the grader's decisions with the answers for all 30 item grades of T3 and for the five grades the graders themselves called close: T1 item 1 for C, D and E, which give "14 entries … opened 5" rather than "5 of 14", and T4 item 3 for C and F, where the edges are named in a list and not one by one. I agreed with all 35. The other 105 item grades were not checked by hand.

## Observed but not graded

The with-skill answers differed in ways the rubric did not ask about. Counted with `grep -ci` over `runs/<id>.answer.md` for `cheapest`, `covered input`, `defect in the original|bug in the JS`, and the marker emoji or `[n established]`:

| | with | without |
|---|---|---|
| T1: names "cheapest" evidence the human can send back | 3 of 3 | 0 of 3 |
| T4: a "covered input space" section | 3 of 3 | 0 of 3 |
| T4: calls the unguarded negative value a defect in the original | 3 of 3 | 0 of 3 |
| T5: confidence markers on the lines | 3 of 3 | 0 of 3 |

These were noticed **after** unblinding. They are not part of the result and are not scored, because a criterion chosen after seeing the answers would fit the answers.

## Limitations

- n = 3 per cell; no significance test. This is a description of 30 answers, not an estimate for the model in general.
- One model (Sonnet) ran the tasks. A different model, or the same model deep in a long session, may behave differently.
- There is no control condition with an unrelated long instruction. The T3 effect could come partly from a longer, stricter prompt rather than from this skill's content.
- The skill was given in the prompt, not loaded through the Skill tool as it would be in real use.
- The grader is a model. Blinding is partial: the skills ask for named sections, so formatting can reveal the condition.
- One run in T1 (without) used Bash once more than allowed, to write its answer file, and said so. That did not touch the audited folder and the run was kept.
- The run agents could see this session's skill list. Each was told not to use the Skill tool. Whether any did was not checked.

## What would make it stronger

Harder tasks, where the model without the skill fails some items (T3 is the model for this), a control prompt of equal length, more runs per cell, and a second grader to measure agreement.
