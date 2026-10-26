# Martin Urumov — Portfolio

AI behaviour evaluation · agent workflow controls · software rule checks

Varna, Bulgaria · remote / on-site / international

Supporting materials for my CV. Each folder is one project. Every folder's README follows the same order: **Purpose → How it works → How to run → Evidence → Limitations → Provenance → Contribution.**

## Projects

| Folder | Kind | What it is | Proof |
|---|---|---|---|
| [`payload-policy-validator/`](payload-policy-validator/) | tool, Python | Gate that decides whether an agent's action payload may run or must stop for a human; two independent thresholds, fail-closed | 17 regression tests, one per documented defect of the previous version |
| [`batch-file-gateway/`](batch-file-gateway/) | tool, Python | Batch file gateway: boundary isolation, then DLP on the isolated text, then exclusive-create write; one fsync'd audit line per file; exit code reflects the outcome | 15 tests; five documented defects of the previous version, each pinned by a test |
| [`status-flow-validator/`](status-flow-validator/) | tool, Python | Two-stage check of a request: status chain in order, payload clean; rejection log never contains the payload | 6 privacy tests + 4 self-test scenarios |
| [`evidence-retriever/`](evidence-retriever/) | tool, PowerShell | Read-only search over Markdown notes that returns file, line, section, the line's own confidence marker and URLs; "no result" is never reported as "absent" | 5-point test matrix (2026-08-03 record, re-run 2026-10-26); one defect found and fixed here (v0.2), one false report retracted |
| [`agent-execution-control/`](agent-execution-control/) | tool, TypeScript + PostgreSQL | Database-enforced gate for AI-agent actions: dual gate at permit issue, STOP > HOLD > OPEN, single-use claim under advisory locks, re-check at dispatch, UNKNOWN never retried, VERIFIED only by an independent verifier | typecheck PASS · 54/54 unit · 24/24 against real PostgreSQL 16 (re-run 2026-10-26); defect history with a fix that broke the build and its correction |
| [`agent-threat-model/`](agent-threat-model/) | research report | Threat model for AI agents with tools and credentials, extended to drone operations: attack surface, 13 ranked risks, 10-part control baseline, reversible 7-day plan, 11 counter-models | 21 registered primary sources; every claim carries a confidence marker |
| [`observer-gated-control-sim/`](observer-gated-control-sim/) | simulation, Python | PID on a trusted state estimate vs PID on the raw sensor, same process, same noise, sensor bias fault; trust from the residual, rate limit shrinks with trust | 13 tests; 50/50 seeds better in the fault window, 50/50 seeds worse (+16.7 %) when the sensor is honest; one defect found and fixed (neither controller reached the setpoint) |
| [`source-monitoring-pilot-sim/`](source-monitoring-pilot-sim/) | simulation + test harness, Python + R | Synthetic pipeline for a criterion-vs-sensitivity experiment: balanced design, locked probit GLMM, resumable 144-unit power runner that cannot count a non-converged fit or pass off a partial run as complete | 45 checks (45/45 on 2026-10-25, 43/45 on 2026-10-26 with the cause documented); 6 of 30 smoke fits rejected by the strict rule; five revisions, each closing named defects (`HISTORY.md`) |

More folders are added one at a time, each with its own evidence.

## How to read the numbers

Every count in this repository (tests, defects, cases) comes with the command that produces it and the output observed when it was last run. Run the command rather than trusting the text. A number without a command is a claim, not evidence.

## Authorship

My contribution is the research questions, requirements, acceptance criteria, instructions to AI assistants, review of results, and the decisions recorded in each README. Code and automated tests were written by AI coding assistants under my direction. Findings made by an AI are marked as such. Details: [`AUTHORSHIP.md`](AUTHORSHIP.md).

## Integrity

`SHA256SUMS` lists every file in the repository. Check it with:

```bash
sha256sum -c SHA256SUMS
```

## Limitations

Each folder lists its own. In general: these are prototypes and documented experiments, not production systems; nothing here claims a deployment, a client, or a security assessment of a live system.
