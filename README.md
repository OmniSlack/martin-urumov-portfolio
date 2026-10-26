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
| [`agent-threat-model/`](agent-threat-model/) | research report | Threat model for AI agents with tools and credentials, extended to drone operations: attack surface, 13 ranked risks, 10-part control baseline, reversible 7-day plan, 11 counter-models | 21 registered primary sources; every claim carries a confidence marker |

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
