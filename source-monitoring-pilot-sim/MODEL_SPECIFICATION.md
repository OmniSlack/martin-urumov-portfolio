# MODEL_SPECIFICATION — confirmatory analysis (SPECIFICATION ONLY)

**Status:** CANDIDATE · SPECIFICATION / PLACEHOLDER — **not an executed inferential analysis.**

This reconstruction does **not** fit a GLMM and implements no custom optimizer.
The model below is the plan for a future validated fit on **real** data in an
approved environment, subject to human methodological approval.

## Confirmatory model

```
response_external ~ condition * source_truth + (1 + source_truth | participant_id) + (1 | item_id)
family = binomial(link = "probit")
```

*(Primary model per PILOT_A_EXECUTION_LOCK_v0.1 §10 — includes the by-item
random intercept, since item source is counterbalanced. The lock itself remains
CANDIDATE until Martin's explicit approval.)*

- **Design:** randomized between-participant. Grouping factor `participant_id`
  (matches the data column exactly — used consistently across Python spec, JSON,
  docs, R script, data dictionary, and tests).
- **Convergence hierarchy (locked; no post hoc search):** full → uncorrelated
  participant structure (`||`) → intercepts-only, all retaining `(1 | item_id)`.
  Any fallback must be reported and the interpretation weakened.
- **Implementation:** `analysis_R/fit_glmm.R` (R, `lme4::glmer`, probit) — real,
  executable, **synthetic validation only** in this repository. Synthetic
  validation results: criterion_only recovered Δĉ=0.443 (gen. 0.45); null Δĉ=0.023
  n.s.; sensitivity_only Δd̂′=0.541 (gen. 0.50) with no spurious Δc. On the
  Python-generated CSVs the item term is singular **by construction** (that
  generator has zero item variance); in the R power simulator with item variance
  present, the full model converges non-singularly.
- **condition:** `active_control` = 0 (reference), `decentering` = 1.
- **source_truth:** `imagined_internal` = 0, `perceived_external` = 1.
- **response_external:** 0/1 outcome.

### Random-effects rule (enforced in `src/model_spec.py`)

`condition` is between-participant and does **not** vary within participant, so it
**must not** appear as a by-participant random slope. The by-participant random
structure is **random intercept + random slope for `source_truth` only**. A
static validator (`validate_random_structure`) raises if `condition` is added as
a random slope; a unit test asserts this.

## Fixed-effect → SDT mapping (documented for the future fit)

With the coding above and a probit link:

- Intercept `b0` → `z(FA)` for control/internal (baseline criterion component);
- `b_source_truth` → control-group sensitivity `d′`;
- `b_condition` → decentering intercept shift (enters the criterion contrast);
- `b_condition:source_truth` → **Δd′** (decentering − control): the sensitivity
  discriminant control.

**Primary estimand:** `Δc = −(b_condition + b_condition:source_truth / 2)`; under
the clean hypothesis `b_condition:source_truth ≈ 0`, so `Δc ≈ −b_condition`.
Directional prediction: `c_decentering > c_active_control` (i.e. `Δc > 0`).

## Convergence and fallback

- inspect singular-fit, gradient/Hessian convergence from the fitting library;
- refit with a second optimizer to confirm stability;
- if the maximal random structure is singular / fails to converge, drop to the
  fallback: `response_external ~ condition * source_truth + (1 | participant_id)`.

## Item-level random effect (OPEN human decision — NOT locked)

Item source is now counterbalanced across participants, so item variability is
separable from `source_truth` and should not be ignored. Candidate model:

```
response_external ~ condition * source_truth + (1 + source_truth | participant_id) + (1 | item_id)
```

This is a **recommendation, not a lock**. The final random structure — whether
to include `(1 | item_id)` (and/or a by-item source slope) — must be approved and
checked for **identifiability and convergence** before preregistration.

## Estimation environment (UNRESOLVED — human decision)

Proposed: **R `lme4::glmer`** with `family = binomial(link = "probit")` (see
`analysis_R/fit_glmm.R`). Alternatives to weigh: `brms` (Bayesian probit with
explicit priors/convergence diagnostics) or a Python `statsmodels`/`bambi`
equivalent. The choice, priors (if Bayesian), and convergence rules must be fixed
by human methodological approval **before** any real-data fit or preregistration.
