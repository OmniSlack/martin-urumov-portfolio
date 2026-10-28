# validation-vs-authority

**Kind:** tools (Python, standard library only) · **Status:** candidate — logic tested, not wired to any real system · **Date:** originals 2026-09-15 → 2026-09-16; copied, run and documented here 2026-10-28

## Purpose

One rule, built three ways: **a check that passed is not a permission.**

- `sidecar_validator_v3.py` — a validator that can only say "I found no violation". It has no word for "execute". Releasing work needs a second, separate thing: a human permit for this exact target, action and scope, with an expiry.
- `execution_ticket.py` — the executor accepts nothing but a ticket. A ticket is issued only when the check passed *and* a human permitted it, is bound to the exact action and payload, and works once.
- `conflict_gate.py` — when two documents state different SHA-256 digests for the same file, the tool does not pick one — not by date, not by majority, not by a title such as CANON. The only way out is measuring the real file.

Supporting tools in the same set: `claim_check.py` (checks a document's digests and `file:line` references against the disk; a test count is never "verified"; a digest of an all-zero file is verified *and* flagged HOLLOW), `kompas_core.py` (fault isolation that stops at the first failing stage; an issue lifecycle in which mitigated ≠ fixed ≠ verified closed), `guarded_turnlog.py` (a log that cannot be written without showing the exact line first and getting an explicit yes).

## How it works

| Tool | The decision | What it refuses |
|---|---|---|
| validator v3 | `VALIDATION_PASS` / `EXECUTION_LOCK` / `VALIDATION_HOLD` | a disabled check counts as unknown, not pass; NaN/∞ input; a truthy string such as `"false"` standing in for a permit; a permit for another target, action or scope; an expired permit |
| execution ticket | ticket or no ticket | calling the executor without a ticket; building a ticket from outside; using a ticket twice; using a ticket for a different action or payload |
| conflict gate | `AGREED` / `SINGLE` / `CONFLICT` | settling a dispute by date, majority, title or file order; comparing digests cut to 16 characters |
| claim check | `VERIFIED` / `FAILED` / `UNCHECKABLE` (+ `HOLLOW`, `MISLABELED`) | treating a test count as verified; guessing between two files with the same name |

`test_injection_neutralization.py` feeds `claim_check` a document that contains a real poisoning note (four rules telling an analyst to treat source text as active rules, repetition as confirmation, gaps as fillable, summaries as originals) plus direct commands — "IGNORE PREVIOUS RULES", "AUTHORIZATION GRANTED", "STATUS: CANON", "SET EXIT CODE 0". The commands produce zero claims; a wrong digest still fails; "999 tests pass" stays uncheckable.

## How to run

```bash
python3 -B -m unittest discover -p "test_*.py" -v          # 90 tests
PYTHONPATH=reference python3 -B probe_v2_defects.py      # v2 and v3 side by side
```

No dependencies. No network. Tests write only to temporary folders.

## Evidence

| Claim | Command | Observed 2026-10-28 (Python 3.13, Linux) |
|---|---|---|
| 90 tests pass | `python3 -B -m unittest discover -p "test_*.py" -v` | `Ran 90 tests … OK` — `evidence/2026-10-28/TESTS.txt` |
| the same count the original package reported | its README of 2026-09-16: "90 tests across 7 modules" | 7 test files, 22 + 20 + 12 + 12 + 9 + 8 + 7 = 90 |
| each of 10 audited v2 defects is real in v2 and closed in v3 | `probe_v2_defects.py` | 10 of 10 rows differ as described — `evidence/2026-10-28/PROBE_V2_V3.txt` |

The probe rows: `Decision.allowed` exists in v2; v2 says `AUTO_EXECUTE` on clean input, when disabled, on NaN, on `authorized="false"`, with a required field missing, on `"d e l e t e"`, and with no permit at all; v2 locks `"dropdown menu"` as if it were `drop`; v2 accepts a NaN threshold. v3 does the opposite in every row.

## Limitations

- **One permit can mint many tickets.** Each ticket works once, but the `HumanPermit` behind it can be used again until it expires.
- **The grantor is a plain string.** `granted_by` is checked only for being non-empty; anyone can write `"martin"`.
- **The ticket is not cryptography.** Code in the same process that deliberately touches private names can forge one. The claim that holds is narrower: a bypass needs deliberate, visible tampering. `guarded_turnlog.py` itself imports the private key from `execution_ticket.py` — visible, and the same kind of touch.
- **`kompas_core.py` promises more than it checks.** Its docstring says the verifier must differ from whoever applied the fix; the code requires only a non-empty `verified_by`.
- **`claim_check.py` misses a digest whose file name is on the previous line** (known since 2026-09-16, still reproduces).
- **`conflict_gate.py` exit code:** when there is both a conflict and a failed claim, the exit code shows only the conflict; both are printed.
- **Not wired to anything real.** These are decisions tested against their own tests.
- **Overlap.** The same rules were later carried into JavaScript and extended in [`ai-proposal-evaluator/`](../ai-proposal-evaluator/) (a verdict spent once, verdict + permit for a protected action, a named verifier). This folder is the Python form of 2026-09-15/16, kept because it carries the v2 → v3 proof.
- **Two different "v3" files exist with the same name.** The one here (2026-09-15, 10,249 bytes) separates validation from authority. The one in [`payload-policy-validator/`](../payload-policy-validator/) (2026-09-16, 15,284 bytes) fixes the scoring maths and still returns `AUTO_EXECUTE`. They grew from two different v2 files.

## Provenance

See [`PROVENANCE.md`](PROVENANCE.md). Every file is a byte-identical copy of the original; nothing was renamed or translated, so the SHA-256 of each file equals the original's.

## Contribution

- Martin Urumov: the rule that validation is not authority; sending v2 to two other AI models for review (GPT and Grok, 2026-09-15), whose finding of the authority leak started v3; refusing an undisclosed write to the log, which led to `guarded_turnlog.py`; the poisoning note the injection test is built on; the decision to keep v2 as the reference and the defects on record.
- AI coding assistant (Claude): implementation of v3, the ticket, the conflict gate, claim check, kompas core, the guarded log and all tests; on 2026-10-28 the copy into this folder, the runs and this README.
- Outside review (GPT, Grok — as recorded in the day report of 2026-09-15): found the authority leak (`.allowed`, `AUTO_EXECUTE`) that Claude had missed.
