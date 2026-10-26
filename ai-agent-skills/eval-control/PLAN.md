# Equal-length control probe — plan (written and hashed before any run)

**Why.** The first probe ([`../eval/`](../eval/)) showed an effect on one task only: T3 (five physical values), with `measured-values-report`, 10/15 without the skill → 15/15 with it. Its own limitations say the effect "could come partly from a longer, stricter prompt rather than from this skill's content", because there was no control of equal length. This probe adds that control. It is the first application, to this repository's own work, of the rule recorded in [`../../AUTHORSHIP.md`](../../AUTHORSHIP.md): a check needs a control of equal cost.

**Question.** On T3, does the skill's content matter, or would any long, strict instruction of the same length give the same result?

**Design.** T3 only, task text unchanged from `../eval/PLAN.md`. Three conditions, 5 runs each, 15 runs, all new (the 30 runs of the first probe are not reused):
- **without** — task text only;
- **with** — the full `../skills/measured-values-report/SKILL.md` (858 words) before the task, and the sentence "Follow this skill while doing the task.";
- **control** — [`control-skill.md`](control-skill.md) (887 words, a style guide on layout, tables, number formatting, units and length, written for this probe; it contains none of the words measured, derived, defined, model, observed, theoretical, origin, confidence, uncertainty, error, and none of the five values) before the task, with the same sentence.

Every run: a fresh Claude Sonnet subagent of this session, its own empty run folder, told not to use the Skill tool, the same closing instruction as the first probe.

**Grading.** Blind, as in the first probe. The 15 answers are shuffled with seed 5151 and labelled A–O. One grader (a subagent on the session's default model) sees only the task, the rubric and the labelled answers. The key is applied afterwards. Rubric: the five T3 items, unchanged.

**Decided in advance.** Out of 25 items per condition:
- the skill's **content** shows an effect if **with − control ≥ 4**;
- **length alone** shows an effect if **control − without ≥ 4**;
- smaller differences are reported as "no difference shown".
(4 of 25 is the same proportion as the first probe's 3 of 15, rounded up.)

**What it cannot show.** n = 5 per cell, no significance test. One task, one model. The control is one particular text; a different control of the same length could do better or worse. The grader is a model, and formatting can still reveal the condition (the skill asks for markers and an origin column), so blinding is partial.
