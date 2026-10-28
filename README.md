# Martin Urumov — Portfolio

[![checks](https://github.com/OmniSlack/martin-urumov-portfolio/actions/workflows/checks.yml/badge.svg)](https://github.com/OmniSlack/martin-urumov-portfolio/actions/workflows/checks.yml)

AI behaviour evaluation · agent workflow controls · software rule checks

Varna, Bulgaria · remote / on-site / international

Supporting materials for my CV. Each folder is one project. Every folder's README follows the same order: **Purpose → How it works → How to run → Evidence → Limitations → Provenance → Contribution.**

## Projects

How the pieces fit together, with diagrams: [`ARCHITECTURE.md`](ARCHITECTURE.md).

| Folder | Kind | What it is | Proof |
|---|---|---|---|
| [`ai-proposal-evaluator/`](ai-proposal-evaluator/) | tool, Node.js | Evaluates an AI proposal against 16 refusal checks and returns STOP > HOLD > CLEAR; refuses on missing information, not only on evident error; one action at a time, append-only journal, cumulative limits, evidence independence, confidence needs evidence; a verdict is spent once, a protected action needs both verdict and permit, "verified" needs a named verifier other than the Core | 259 tests (the 12 newest: 7 fail on the previous version, 5 pass); gate ablation 31/31; action-lock invariant 37,448 sequences / 0 violations (the original check was vacuous — fixed and recorded); 222-commit history |
| [`defect-register/`](defect-register/) | data + library, Node.js | 165 defects recorded while building the evaluator, in 22 families, each with how it was found; every new case is compared against it | 51 found by the owner, 114 by the instruments (self-reported); 21 tests incl. equivalence with the original helpers |
| [`claim-audit-tools/`](claim-audit-tools/) | tools, Node.js + Python | 13 small tools for text and claims: source classification, observation status, builder vs hunter, claim mutation ("may" → "is"), overclaim scanner, claims register, equivalence test (TOST), action journal, copy canary | 30 tests; 22/22 equivalent to the originals; 5 defects found and fixed |
| [`ai-agent-skills/`](ai-agent-skills/) | instructions for an AI agent, Markdown | Five Claude Code skills, each made from a recorded agent error: confidence on every claim, a counted scope section in every report, two causes for every empty result, two labels on every number, no "matches the original" without searched edges | 28 tests; blind with/without probe (30 runs, rubric locked before the runs): effect shown for 1 skill of 5, the other 4 tasks at ceiling — stated in the folder |
| [`dual-pass-reading-probe/`](dual-pass-reading-probe/) | experiment, Python + AI subagents | Does a second, independent pass in reverse order, with checkpoints in the middle and at the end, catch what one pass misses? 20 passes over 2000 synthetic log lines with 20 planted exceedances, plan hashed before the runs | every pass 20/20, 0 false positives: a ceiling, so no difference can be shown on this material; harder material is the next step |
| [`document-claim-checker/`](document-claim-checker/) | tool, Python | Checks the claims a document makes about files — SHA-256 digests, `file:line` references, test counts — against the files on disk; five statuses never merged; a test count is always "uncheckable" without a re-run | 15 tests; identical to the original on 400 generated lines; one defect found and fixed (a missing path was verified against a namesake elsewhere) |
| [`payload-policy-validator/`](payload-policy-validator/) | tool, Python | Gate that decides whether an agent's action payload may run or must stop for a human; two independent thresholds, fail-closed | 17 regression tests, one per documented defect of the previous version; a second copy (2026-10-26) replaces instant locks on relative jumps with a flag that must survive evidence: 14 tests |
| [`validation-vs-authority/`](validation-vs-authority/) | tools, Python | A check that passed is not a permission: a validator with no word for "execute", an executor that accepts only a single-use ticket bound to the exact action, a gate that keeps two conflicting digests in conflict until the real file is measured | 90 tests (the count the original package reported); v2 vs v3 probe: all 10 audited v2 defects reproduced in v2 and closed in v3 |
| [`batch-file-gateway/`](batch-file-gateway/) | tool, Python | Batch file gateway: boundary isolation, then DLP on the isolated text, then exclusive-create write; one fsync'd audit line per file; exit code reflects the outcome | 18 tests; five documented defects of the previous version, each pinned by a test; two more gaps (a symbolic link crossing the boundary, a false "damaged file" signal) found by an outside AI review and closed on 2026-10-27 — the 3 new tests: 2 fail on the previous code |
| [`status-flow-validator/`](status-flow-validator/) | tool, Python | Two-stage check of a request: status chain in order, payload clean; rejection log never contains the payload | 6 privacy tests + 4 self-test scenarios |
| [`evidence-retriever/`](evidence-retriever/) | tool, PowerShell | Read-only search over Markdown notes that returns file, line, section, the line's own confidence marker and URLs; "no result" is never reported as "absent" | 5-point test matrix (2026-08-03 record, re-run 2026-10-26); one defect found and fixed here (v0.2), one false report retracted |
| [`agent-execution-control/`](agent-execution-control/) | tool, TypeScript + PostgreSQL | Database-enforced gate for AI-agent actions: dual gate at permit issue, STOP > HOLD > OPEN, single-use claim under advisory locks, re-check at dispatch, UNKNOWN never retried, `VERIFIED` only after `COMPLETED` (who may set it is not restricted — no separate database roles) | typecheck PASS · 54/54 unit · 24/24 against real PostgreSQL 16 (re-run 2026-10-26); defect history with a fix that broke the build and its correction |
| [`agent-action-verifier/`](agent-action-verifier/) | library, Node.js | The attempt/verify half of agent execution control: the adapter may not do more than permitted (envelope check), attempt states never collapse or rewind, UNKNOWN is never safe to retry, and an adapter's "success" is data until an independent probe agrees | 30 tests (22 original + 8) + 5,000-envelope fuzz; two defects fixed — an unlisted field (e.g. `cc`) passed the envelope check behind a guard that could never fire, and a `VERIFIED` that did not say what was verified |
| [`agent-threat-model/`](agent-threat-model/) | research report | Threat model for AI agents with tools and credentials, extended to drone operations: attack surface, 13 ranked risks, 10-part control baseline, reversible 7-day plan, 11 counter-models | 21 registered primary sources; every claim carries a confidence marker |
| [`observer-gated-control-sim/`](observer-gated-control-sim/) | simulation, Python | PID on a trusted state estimate vs PID on the raw sensor, same process, same noise, sensor bias fault; trust from the residual, rate limit shrinks with trust | 13 tests; 50/50 seeds better in the fault window, 50/50 seeds worse (+16.7 %) when the sensor is honest; one defect found and fixed (neither controller reached the setpoint) |
| [`source-monitoring-pilot-sim/`](source-monitoring-pilot-sim/) | simulation + test harness, Python + R | Synthetic pipeline for a criterion-vs-sensitivity experiment: balanced design, locked probit GLMM, resumable 144-unit power runner that cannot count a non-converged fit or pass off a partial run as complete | 45 checks (45/45 on 2026-10-25, 43/45 on 2026-10-26 with the cause documented); 6 of 30 smoke fits rejected by the strict rule; five revisions, each closing named defects (`HISTORY.md`) |
| [`keynes-beauty-contest-sim/`](keynes-beauty-contest-sim/) | simulation, Node.js | Keynes's beauty contest (guess 2/3 of the average), eleven levels of reasoning against different crowds: the winning level depends on who is playing | 6 tests; numbers identical to the original; checked against Nagel (1995) — one crowd labelled as her data is an assumed distribution (recorded) |
| [`p-vs-np-gap-measurement/`](p-vs-np-gap-measurement/) | simulation, Node.js | Measures the cost of finding a solution vs checking one on small instances; does not and cannot resolve P vs NP | 6 tests; numbers identical to the original |

More folders are added one at a time, each with its own evidence.

## How to read the numbers

Every count in this repository (tests, defects, cases) comes with the command that produces it and the output observed when it was last run. Run the command rather than trusting the text. A number without a command is a claim, not evidence.

The badge above is GitHub running those commands on every push: file integrity, the Node.js and Python test suites, the PowerShell checks, and the TypeScript typecheck and unit tests. Two things it does not run: the PostgreSQL suite of `agent-execution-control/` (needs a database) and `source-monitoring-pilot-sim/` (needs R and takes long); their last runs are recorded in their folders. The same checks on your own machine:

```bash
bash .github/run-checks.sh
```

## Authorship

My contribution is the research questions, requirements, acceptance criteria, instructions to AI assistants, review of results, and the decisions recorded in each README. Code and automated tests were written by AI coding assistants under my direction. Findings made by an AI are marked as such. Details: [`AUTHORSHIP.md`](AUTHORSHIP.md).

## Integrity

`SHA256SUMS` lists every file in the repository. Check it with:

```bash
sha256sum -c SHA256SUMS
```

## Limitations

Each folder lists its own. In general: these are prototypes and documented experiments, not production systems; nothing here claims a deployment, a client, or a security assessment of a live system.
