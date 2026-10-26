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

The relative check (surprise against `gate·σ` through `ψ = exp(−r²/2(gate·σ)²)`, and a step limit that shrinks with `ψ`) is the same mechanism that [`observer-gated-control-sim`](../observer-gated-control-sim/) applies to a temperature sensor; here it is applied to payload discrepancy.

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

## Second copy: flag and hold (2026-10-26)

`flag_hold_validator.py` is a new copy next to V3, which stays unchanged. It reuses V3 for the score `m` and the thresholds, and changes only what happens on a relative jump. The rule is Martin Urumov's method: **direction matters, and a flag is data, not a verdict.**

| Situation | V3 (`payload_policy_validator.py`) | Flag copy (`flag_hold_validator.py`) |
|---|---|---|
| `m ≥ m_lock` (0.35) | `EXECUTION_LOCK` | `EXECUTION_LOCK` (unchanged) |
| payload cleaner than the baseline (jump down) | `EXECUTION_LOCK` — a false stop | `AUTO_EXECUTE` (`DOWNWARD_ACCEPTED`) |
| jump up, below `m_lock` | `EXECUTION_LOCK` at once | `HOLD`: a flag is opened |
| the flag is confirmed (2 more jumps, or `m_lock` reached) | — | `EXECUTION_LOCK`, and it stays until a named reviewer clears it with written evidence |
| the next 3 observations are normal | — | flag vanishes, `AUTO_EXECUTE`, reason recorded as "missing context" |
| the flag is asked to be cleared, or the same request is repeated | — | refused / counted as a confirmation; a flag is not lowered under pressure |
| baseline while a flag is open | — | frozen, so a sustained jump cannot normalise itself |

Why: an outside review (Codex, `reference/test_sidecar_v2_gaps.py`, test_08) measured on its grid that the relative check caught 2,727 genuine violations, every one of them also caught by the hard threshold alone, and added 1,540 false stops. It proposed dropping ψ as a gate (`reference/sidecar_validator_v2_alternative.py`). Checking the same question on V3 showed where the false stops come from: of 918 grid cells below `m_lock`, V3 locks 766 at once — **675 of them are payloads cleaner than the baseline**, 91 are jumps up. The flag copy locks none of them, holds the 91 jumps up for confirmation, and executes the rest.

```bash
python3 -m unittest test_flag_hold_validator -v   # 14 tests
```

Evidence: `evidence/2026-10-26/FLAG_HOLD.txt` (14/14; V3 17/17 unchanged; the grid counts; Codex's tests as received fail 14 checks against the described V2 logic, as designed, and pass 3/3 with one skip when wired to his alternative).

Limits of the flag copy: the confirmation count (2) and the clearing count (3) are chosen, not calibrated; the flag tracks one stream of requests (one baseline), not one per caller; it has not run on real traffic.

## Limitations

- **Sustained traffic just under the threshold.** At `m = m_lock − ε` forever, the baseline catches up, `r_rel → 0`, the absolute threshold does not fire → permanent `AUTO_EXECUTE`. That is what a threshold means, not a defect: in steady state `m_lock` does 100% of the protection; the relative component catches transitions only.
- **`M_DENOM = 4.0` is an arbitrary constant.** It replaces a schema-dependent arbitrary value with a schema-independent one. Progress on comparability, **not calibration**.
- **The weights 1.0 / 0.5 / 1.5 are inherited from V2, unmeasured.**
- **A defect in V3 itself, caught by a test:** the first `_validate_thresholds` carried V2's logic and declared the absolute threshold dead. It is not — V2 computed ψ over `max(...)` and swallowed the absolute check; V3's two components look at different quantities. Fixed only when the test was written. Recorded, not smoothed over.
- All numbers (`M_DENOM`, weights, `sigma`, `m_lock`) are waiting for a run over real benign traffic. `calibrate()` exists for that; it has not been run on real data.

## Provenance

Original package `SIDECAR_VALIDATOR_V3__2026-09-16.zip`, SHA-256 `dbc9ede6…bfb85`. Files renamed by function (`sidecar_validator_v3.py` → `payload_policy_validator.py`, class `SidecarValidatorV3` → `PayloadPolicyValidator`); comments translated from Bulgarian; logic unchanged (see Evidence). The V2 reference is byte-identical to the received copy.

## Contribution

- Martin Urumov (flag copy): the rule that a downward jump is acceptance, that an upward jump raises a flag which is data and must survive evidence before it stops anything, and that a flag is not lowered under pressure.
- Codex (outside review, 2026-10): `reference/sidecar_validator_v2_alternative.py` and `reference/test_sidecar_v2_gaps.py`, carried byte-identical.

- Martin Urumov: the questions that led to F1–F4; requirements and acceptance criteria (an adaptive baseline must not be able to hide sustained risk; every threshold must be able to change a decision; a reported "PASS" without a measurable number is a claim, not evidence); review of the findings; the decision to keep the V3 self-defect on record and V2 as a byte-identical reference.
- AI coding assistants: running V2 and documenting F1–F4 at Martin's prompting, implementation of V3, the test suite, and the renaming/translation in this repository; on 2026-10-26 the measurement that 675 of V3's 766 sub-threshold locks on the review grid are clean payloads, and the implementation and tests of the flag copy.
