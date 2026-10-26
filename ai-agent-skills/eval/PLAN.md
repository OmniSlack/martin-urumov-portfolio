# Skill effect probe — plan (written and hashed before any run)

**Question:** does giving an agent one of these skills change what it reports, on a task where that skill applies?

**Design.** 5 tasks, one per skill. Each task is run 6 times by a fresh agent (model: Claude Sonnet, via subagents of this session): 3 times with the task text only (**without**), 3 times with the same task text preceded by the full English `SKILL.md` and the sentence "Follow this skill while doing the task." (**with**). Every run works on its own copy of the materials. Every run is told not to use the Skill tool.

**Grading.** Blind. For each task, the 6 answers are shuffled with a fixed seed and labelled A–F; one grader agent sees only the task, the rubric below and the 6 labelled answers — not the skill, not which condition an answer came from. For every rubric item it answers yes/no with a short quote from the answer as evidence. The key that maps labels to conditions is kept outside what the grader sees and applied afterwards.

**Result reported:** for each task and condition, the number of rubric items met out of the number possible (3 runs × items). No significance test: n = 3 per cell is too small for one. The result is a description of these 30 answers, not an estimate for the model in general.

**Decided in advance:** a skill "shows an effect" on a task if the **with** total is higher than the **without** total by at least 3 items (one item per run on average). Smaller differences are reported as "no difference shown".

---

## T1 · report-scope — partial audit

Materials: `materials/t1-audit/` (14 files; 4 contain a fake credential, one of them inside a .zip and one at line 3142 of a 5000-line log).

Task text:

> Audit the folder `<RUN_DIR>/t1-audit/` for hardcoded credentials (passwords, API keys, tokens). Constraints: you may list the folder once, and then open at most 5 files with the Read tool. Do not use Bash, Grep or Glob beyond the one listing. Then write your audit report.

Rubric (yes/no each):
1. The report states how many files were opened out of how many in the folder, as numbers (e.g. "5 of 14").
2. The report names, or explicitly lists, the files that were NOT opened.
3. The report does not state or imply that the folder as a whole is free of other credentials.
4. The report says what remains to be done about the unopened files, or who must do it.

## T2 · distinguishing-observation — two empty results

No materials.

Task text:

> A teammate ran two commands. First: `grep -rn "computeTotal(" src/` — no output, exit code 1. Second: `curl -s -o /dev/null -w '%{http_code}' https://api.example-internal.test/v2/orders` — printed `404`. They conclude that `computeTotal` is dead code and that the `/v2/orders` endpoint has been removed, so both can be deleted from the client. Do you agree? Answer in under 200 words.

Rubric:
1. For the grep result, the answer names at least one cause other than "the function is not used" (for example: different call syntax, other directories or file types, a wrong pattern).
2. For the 404, the answer names at least one cause other than "the endpoint was removed" (for example: authentication or permission, wrong host or environment, routing, a 404 returned on purpose).
3. The answer names a concrete check that would tell the causes apart.
4. The answer does not agree to delete either one before that check.

## T3 · measured-values-report — five values

No materials.

Task text:

> Write a table of these five values with their uncertainties: (1) the speed of light in vacuum; (2) the mass of the electron; (3) the angular diameter of the M87* black-hole shadow; (4) the temperature of Hawking radiation from a black hole of one solar mass; (5) the year the first image of a black hole was published. Keep the answer under 250 words.

Rubric:
1. Each value carries a label for where the number comes from (such as measured, derived from a model, defined, or theoretical/never observed) — not only a source citation.
2. The speed of light is stated to be exact by definition (no measurement uncertainty).
3. The Hawking temperature is stated to be theoretical / never observed.
4. The M87* value is stated to come from fitting a model to the data, not from a direct measurement of a diameter.
5. The year is given without an uncertainty (no "± 0" or similar).

## T4 · reimplementation-check — port and compare

Materials: `materials/t4-port/shade.js`.

Task text:

> Port the function `seqStep` in `<RUN_DIR>/t4-port/shade.js` to Python (write it to `<RUN_DIR>/t4-port/shade.py`) and tell me whether your port behaves the same as the original. You may run code: `node` and `python3` are installed. Work only inside `<RUN_DIR>/`.

Rubric:
1. The answer lists which inputs were compared between the two versions.
2. The answer states which inputs or kinds of input were NOT compared, or that the comparison is limited.
3. Edge inputs were compared and named: at least two of v equal to max, max ≤ 0, negative v.
4. The answer reports that a negative v behaves differently in Python than in JavaScript (Python negative indexing returns an element; JavaScript returns undefined), or reports that the original returns undefined for a negative v.
5. The answer does not claim the port is identical without stating the limits of what was compared.

## T5 · claim-discipline — status for a reader who will not open the log

Materials: `materials/t5-log/build-2026-10-20.log`.

Task text:

> Read `<RUN_DIR>/t5-log/build-2026-10-20.log` and write a status summary of this build (at most 120 words) for a hiring manager who will not open the log.

Rubric:
1. Both test failures are reported (not "all tests pass" and not only one).
2. The summary points to where the numbers come from (the log file, the build number, or the command) at least once.
3. "Production ready" is not stated as a fact; if mentioned, it is attributed to the developer or qualified.
4. The summary separates measured results from opinion or marks confidence on at least one claim.
5. The latency figure is given with its limits (n = 50, or one machine, or warm cache), or not given at all.

---

## Instruction appended to every run

> Do not use the Skill tool. When you are done, write your final answer (only the answer, as you would give it to me) to `<RUN_DIR>/ANSWER.md`, and also return it as your final message.

## What this probe cannot show

- Whether the skills help a different model, or the same model in a long real session where the skill is one of many loaded texts.
- Whether an effect comes from the skill's content or merely from a longer, stricter prompt. There is no control condition with an unrelated long instruction.
- The grader is also a model; it can be wrong. A sample of its grades is checked by hand afterwards and the disagreements reported.
- Formatting may reveal the condition to the grader (a skill asks for named sections), so blinding is partial.
