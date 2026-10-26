# ASSUMPTIONS AND LIMITATIONS — reconstruction (CANDIDATE)

## Reconstruction status

- The original PowerShell prototype source was **unavailable**; this is a Python
  reconstruction from documentation, not a reproduction or replacement.
- Supplied control/review/documentation files are preserved unchanged.

## Revision applied (per independent code verification)

- **Item source is counterbalanced** across participants (inverse A/B lists);
  `item_id` is no longer confounded with `source_truth` (verified: 0/100
  confounded items).
- Model grouping factor aligned to **`participant_id`** across spec, JSON, docs,
  R script, data dictionary, and tests.
- **Block-specific assignment seed** is now recorded on each row (test vs
  practice), fixing the earlier provenance defect.
- A by-item random effect `(1 | item_id)` is added to the spec as an **OPEN human
  decision** (not locked; identifiability/convergence to be checked).

## What is implemented and executed

- synthetic generation of five scenarios;
- item/source counterbalancing (A/B inverse lists) with per-block seed provenance;
- trial-level, model-ready source-monitoring data with an encoding phase;
- descriptive `d′` and criterion `c` (log-linear corrected);
- between-participant structural validation;
- enforcement that `condition` has no by-participant random slope;
- selective manipulation-check battery and machine-readable verdicts;
- the confounded-demand failure rule;
- emission of the exact confirmatory-model formula.

## What is specification / placeholder (NOT executed)

- The probit **GLMM is not fitted**. No custom optimizer exists. The confirmatory
  model is a specification (`MODEL_SPECIFICATION.md`, `analysis_R/fit_glmm.R`) for
  a validated future fit in an approved environment (R `lme4::glmer`, probit),
  subject to human methodological approval.
- Descriptive synthetic outputs are **not** inferential results and carry no
  statistical certainty.

## Statistical assumptions (synthetic layer)

- equal-variance SDT for the binary internal/external judgment;
- trials generated as conditionally independent (no real learning/fatigue/sequence effects);
- log-linear extreme-rate correction `(count+0.5)/(n+1)` used **only** for
  descriptive participant-level SDT — a trial-level GLM on 0/1 data needs none;
- confidence and reaction time are exploratory; mean confidence is not a
  confirmatory endpoint;
- reaction time does not index an "Attribution Window".

## Decision thresholds are placeholders

- The synthetic verdict thresholds (`mpod_min_diff`, `matched_margin`,
  `c_decision_margin`, `d_decision_margin`) are **placeholders for the harness
  only**. They are **not** SESOI and **not** equivalence margins.
- Synthetic scenario offsets are generator settings, **not** empirical effect
  estimates and **not** SESOI values.
- A clean `Δc` is **not** interpretable without a selective manipulation-check
  pattern. Non-significance on matched dimensions is **never** treated as evidence
  of equivalence; equivalence requires predefined margins set by human approval.

## Boundaries

No stress/arousal, HGF, DDM, neuroimaging, clinical sampling, HMeta-d, real data,
publication, or preregistration. Nothing is promoted to ACTIVE or CANON.

## Requires human methodological approval before human data

Exact decentering and active-control scripts; task stimuli and source labels;
trial count; confidence scale; **the validated GLMM estimation environment**;
SESOI and equivalence margins; exclusion/missing-data rules; power-analysis
inputs; ethics and participant-safety procedures.
