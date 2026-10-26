# payload-policy-validator

**Kind:** tool (Python, standard library only) · **Status:** candidate — mechanism tested, thresholds not calibrated · **Date:** 2026-09-16

## Purpose

A gate that sits beside an AI agent and decides, for one action payload at a time, whether it may run (`AUTO_EXECUTE`) or must stop for a human (`EXECUTION_LOCK`). It scores how far the payload is from its declared schema (missing required fields, extra fields, risk keywords) and judges that score on two independent scales.

## How it works

1. `compute_policy_discrepancy(payload, schema)` → `m ∈ [0,1]` plus a breakdown. The denominator is a constant, so the same violation gives the same `m` in every schema.
2. `evaluate_loop(m, t_pred)` applies two thresholds:
   - **absolute**: `m ≥ m_lock` → lock. This is the only check that still fires after a baseline has adapted to sustained bad traffic.
   - **relative**: surprise `|m − t_pred|` against `gate·σ`, through `ψ = exp(−r²/2(gate·σ)²)`; `ψ < 0.85` → lock.
   Either one locks. Degenerate parameters (`gate ≤ 0`, `σ ≤ 0`) lock (fail-closed).
3. `delta_t` — a deliberate delay that grows with surprise, covering the whole declared `[du_min, du_max]` range.
4. `calibrate(m_values)` returns `m_lock` and `σ` from benign traffic, and **refuses** when there are too few observations for the requested quantile.

## How to run

```bash
python3 -m unittest test_payload_policy_validator -v   # 17 tests
python3 payload_policy_validator.py                     # prints the config report
```

No dependencies. No network.

## Evidence

| Claim | Command | Observed 2026-10-26 (Python 3.13, Linux) |
|---|---|---|
| 17 regression tests pass, one per defect | `python3 -m unittest test_payload_policy_validator -v` | `Ran 17 tests … OK` |
| V2 lets a missing field through a 10-field schema (F3) | see `FINDINGS_V2.md` | `F3: 0.0833 AUTO_EXECUTE` |
| V2 fires keyword `rm` on `confirm` (F4) | see `FINDINGS_V2.md` | `F4: 0.5` |
| Renaming did not change behaviour | 20,000 random inputs, old vs new outputs compared (timestamp excluded) | 0 differences |
| `calibrate()` refuses n=250 for the 0.99 quantile | `test_refuses_insufficient_n_for_requested_quantile` | raises `ConfigError` |

## Limitations

- **Sustained traffic just under the threshold.** At `m = m_lock − ε` forever, the baseline catches up, `r_rel → 0`, the absolute threshold does not fire → permanent `AUTO_EXECUTE`. That is what a threshold means, not a defect: in steady state `m_lock` does 100% of the protection; the relative component catches transitions only.
- **`M_DENOM = 4.0` is an arbitrary constant.** It replaces a schema-dependent arbitrary value with a schema-independent one. Progress on comparability, **not calibration**.
- **The weights 1.0 / 0.5 / 1.5 are inherited from V2, unmeasured.**
- **A defect in V3 itself, caught by a test:** the first `_validate_thresholds` carried V2's logic and declared the absolute threshold dead. It is not — V2 computed ψ over `max(...)` and swallowed the absolute check; V3's two components look at different quantities. Fixed only when the test was written. Recorded, not smoothed over.
- All numbers (`M_DENOM`, weights, `sigma`, `m_lock`) are waiting for a run over real benign traffic. `calibrate()` exists for that; it has not been run on real data.

## Provenance

Original package `SIDECAR_VALIDATOR_V3__2026-09-16.zip`, SHA-256 `dbc9ede6…bfb85`. Files renamed by function (`sidecar_validator_v3.py` → `payload_policy_validator.py`, class `SidecarValidatorV3` → `PayloadPolicyValidator`); comments translated from Bulgarian; logic unchanged (see Evidence). The V2 reference is byte-identical to the received copy.

## Contribution

- Martin Urumov: the questions that led to F1–F4; requirements and acceptance criteria (an adaptive baseline must not be able to hide sustained risk; every threshold must be able to change a decision; a reported "PASS" without a measurable number is a claim, not evidence); review of the findings; the decision to keep the V3 self-defect on record and V2 as a byte-identical reference.
- AI coding assistants: running V2 and documenting F1–F4 at Martin's prompting, implementation of V3, the test suite, and the renaming/translation in this repository.
