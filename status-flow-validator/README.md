# status-flow-validator

**Kind:** tool (Python, standard library only; tests need `pytest`) · **Status:** candidate · **Date:** 2026-09-13

## Purpose

Two-stage validation of a request: did it walk its status chain in the right order, and is its payload clean? The two stages always both run, so one report shows process faults and payload faults separately. Rejections go to an append-only JSON Lines log that never contains the payload.

## How it works

- **Stage 1 — status flow.** Required order `ATTEMPTED → COMPLETED → VERIFIED`. A history that skips a step, repeats one, runs backwards, contains an unknown status, or stops early fails, and the record names the transition that is missing. `VERIFIED` is reachable only from `COMPLETED`.
- **Stage 2 — payload scan.** Uses an external scanner (`dlp_test_suite`) if importable, otherwise a built-in pattern set (API keys, bearer tokens, private-key blocks, system tags, instruction/role overrides). If the external scanner raises, the payload **fails** — a scanner error never passes a payload. External findings are reduced to a generic label, because scanner output may quote the secret it found.
- **Verdict.** `PAYLOAD BLOCKED` beats `FLOW INCOMPLETE` beats `FLOW COMPLETE`. Non-complete verdicts are appended to the rejection log with a rejection analysis and a recommended action.

## Why this name

The module was originally called `dual_gate_simulator.py`. "Dual gate" is the name of a different control — the one enforced at database level in the execution-control layer (gate OPEN with no hold **and** a matching Core CLEAR decision, with the permit issued before execution). This module validates something else: that a request walked its status chain and that its payload is clean. Two different controls must not share one name, so this one was renamed and its terminology kept deliberately distinct (`stage`, not `gate`; `request_id`, not `permit_id`; `FLOW COMPLETE`, not `PERMIT GRANTED`). The reasoning is kept in the module docstring.

## How to run

```bash
python3 -m pytest -q                                  # 6 tests
python3 status_flow_validator.py --selftest           # 4 built-in scenarios
```

## Evidence

| Claim | Command | Observed 2026-10-26 (Python 3.13, Linux) |
|---|---|---|
| 6 privacy tests pass | `python3 -m pytest -q` | `6 passed` |
| 4 self-test scenarios give the expected verdicts | `python3 status_flow_validator.py --selftest` | `4 pass / 0 fail`, exit 0 |
| No payload or secret is written to the record or log, whether the external scanner raises, returns a finding, or returns malformed output | `test_external_scanner_cannot_leak_payload` (3 cases) | `SECRET not in …` holds in all three |
| A status-only rejection does not copy an unrecognised secret from the payload | `test_status_only_rejection_omits_unrecognised_secret` | holds |
| Renaming/translation did not change behaviour | 5,000 random histories × payloads, old vs new records compared (timestamp and the translated `recommended_action` text excluded) | 0 differences |

## Limitations

- The built-in pattern set is a fallback, not a DLP product; it catches a handful of well-known shapes.
- `dlp_test_suite` (the intended external scanner) is not included; the tests exercise the fallback and an injected scanner.
- Stage 1 checks order only; it does not check timestamps, actors or authority. Those live in the execution-control layer, by design.
- The rejection log is append-only but not tamper-evident.

## Provenance

See [`PROVENANCE.md`](PROVENANCE.md). File and class names unchanged (already functional). Two user-facing strings (`recommended_action`), four self-test scenario titles and two self-test print labels translated from Bulgarian; logic unchanged. The three validator tests were separated out of the original pack's shared regression file.

## Contribution

- Martin Urumov: the requirement that two different controls must not share one name; the requirement that a scanner error must fail the payload rather than pass it; the rule that no payload text may ever be logged; review of results.
- AI coding assistants: implementation, tests, the rename from `dual_gate_simulator.py` as recorded in the module docstring, and the translation/split in this repository.
