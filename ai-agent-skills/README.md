# ai-agent-skills

**Kind:** instructions for an AI coding agent (Claude Code skills, Markdown) + one runnable example · **Status:** used in the source repository; English copies 2026-10-26 · **Date:** originals 2026-09-20 / 2026-09-21

## Purpose

Five skills that change how an AI agent reports its own work. Each one is built from an error that was observed, recorded with a date, and turned into a rule the agent loads before the situation where that error happens:

| Skill | Loaded when | What it makes the agent do |
|---|---|---|
| [`claim-discipline`](skills/claim-discipline/SKILL.md) | writing anything that leaves the session; any claim with a number | mark every claim with its own confidence level; give an address (file:line, command, hash) instead of a phrase; trace a claim to a primary source; compare new text with the defect register; stop on a missing or mismatched hash |
| [`report-scope`](skills/report-scope/SKILL.md) | any review, audit, "I went through it", "I can't" | end with a counted SCOPE section: what was opened, what was not, what stopped it, what falls to the human; run a command before writing "I can't" |
| [`distinguishing-observation`](skills/distinguishing-observation/SKILL.md) | an empty result, a 404/403, zero hits, "doesn't work" | name two causes that leave the same trace and the observation that would separate them; HOLD if it cannot be made |
| [`measured-values-report`](skills/measured-values-report/SKILL.md) | a report with numbers | give every number two labels: confidence, and origin (measured / derived / defined / never observed); mandatory sections for what is not known and what was never observed |
| [`reimplementation-check`](skills/reimplementation-check/SKILL.md) | "make it do the same", "rewrite it", any claim that an implementation matches an original | say which of three tasks it is; list the covered and uncovered inputs and the edges searched on purpose; never claim a match without one |

## How it works

A skill is a Markdown file with a `name` and a `description`. The agent reads the descriptions at the start of a session and loads a skill's full text when the situation in its description occurs. The text is an instruction to the model, not code; it works only as far as the model follows it.

The skills point to tools in this repository where one exists:

| Skill refers to | Tool here |
|---|---|
| confidence scale | [`defect-register/confidence-scale.js`](../defect-register/confidence-scale.js) |
| compare with the defect register | [`defect-register/register.js --compare`](../defect-register/) |
| overclaiming wording | [`claim-audit-tools/overclaim-scanner.js`](../claim-audit-tools/) |
| single-source classification | [`claim-audit-tools/source-classification.js`](../claim-audit-tools/) |
| hash table of a handoff file | [`document-claim-checker/`](../document-claim-checker/) |

Four tools of the source repository are named in the originals and **not** carried: the address-versus-phrase scanner, the source-chain checker, the handoff generator, and the probe runner for `report-scope` (not run here, because its probes make network requests). Each skill says so where it refers to them.

## How to run

```bash
node --test                                              # 26 tests
node skills/reimplementation-check/worked-example.js     # the measured case in that skill
```

To use the skills with Claude Code, copy a folder from `skills/` into a project's `.claude/skills/`.

## Evidence

| Claim | Command | Observed 2026-10-26 (Node 22) |
|---|---|---|
| Five well-formed skills (name matches folder, description present), English only, every relative link resolves, authorship stated in each | `node --test` | pass ([`TESTS.txt`](evidence/2026-10-26/TESTS.txt)) |
| The six original files are byte-identical to the source commit | `node --test` (hashes from `PROVENANCE.md`) | pass |
| `reimplementation-check`: 10,000 random inputs find 0 mismatches; 7 searched edges find 1 (`v=10, max=10`: original `f`, copy `undefined`); the original itself returns `undefined` for `v=-1` | `node skills/reimplementation-check/worked-example.js` | as stated ([`WORKED_EXAMPLE.txt`](evidence/2026-10-26/WORKED_EXAMPLE.txt)); the original's unseeded run gives the same, checked once on 2026-10-26 |
| The English worked example computes the same as the original on 10 inputs | `node --test` | pass |
| The excluded skill is not carried | `node --test` | pass |

## Limitations

- **There is no evidence here that a skill changes a model's behaviour.** The tests check the files, not the model. The only measured result is the worked example, which tests the rule's content (random testing misses an edge), not whether an agent applies it. The way to measure it — the same tasks with and without a skill, answers compared by a fixed rubric — is not done.
- The examples inside the skills (a 404 from GitHub, `example.com → 403`, three runs of `git push`, the review that skipped files) are reported as they were recorded in the source repository on 2026-09-20. They are not reproduced here.
- The skills are translations. The Bulgarian originals in `original-bg/` are the versions that were used. A translation can change emphasis; the quoted requirements are marked as translated.
- A sixth skill of the source repository (`nablyudatel`) is not carried: it describes a self-observation method from the owner's book, which is outside the scope of this repository.
- `claim-discipline` refers to a defect register of 165 entries; most were recorded on one day (see [`defect-register/`](../defect-register/), Limitations).

## Provenance

See [`PROVENANCE.md`](PROVENANCE.md). Source: `OmniSlack/omniecho-core`, `.claude/skills/`, commit `848ae1a` (2026-10-13). The originals are in `original-bg/`, unchanged.

## Contribution

- Martin Urumov: the theory, the rules, and the quoted requirements — including the trigger for `report-scope` ("what I can't do, and you must"), the defect register as the reference everything is compared with, the confidence scale, and "an address cannot be imitated". He found defect B-13, from which `report-scope` was made.
- AI assistants: the wording of the five skills (2026-09-20/21), the worked example, and in 2026-10-26 the English copies, the mapping to this repository's tools, the seeded random generator in the example, and the 26 tests.
