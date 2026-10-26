# PROTOCOL_DRAFT — reconstruction (CANDIDATE)

Derived protocol for `PILOT_A_PYTHON_RECONSTRUCTION_v1`. Consistent with
`PILOT_A_CORE_LOCK_v0.1` and the independent methodological review. Supplied
originals are unchanged; this is a separate reconstruction document.

## Aim

Test only whether a brief **state-decentering** induction changes
source/status-attribution relative to a **positively matched active control**.
No stress/arousal, HGF, DDM, neuroimaging, clinical groups, or the full
"Attribution Window" construct.

## Design (locked)

Randomized **between-participant**, single-blind to hypothesis. Rationale: state
decentering cannot be cleanly reset within participant (carryover/demand).

## Conditions

- **decentering:** brief standardized cognitive-defusion / state-decentering
  procedure.
- **active_control:** **directed semantic processing** of the same/matched
  neutral material — matched for duration, attention, effort, instruction
  density, credibility, researcher contact, and expectancy — with no
  disidentification / cognitive-distancing / decentering instruction.

## Source-monitoring task (with encoding phase)

1. **Encoding phase:** each item is either **perceived** (shown → external) or
   **imagined** (generated on cue → internal); balanced 50/50.
2. Retention/transition.
3. **Source-judgment phase:** binary internal/external judgment.
4. **Sequential confidence** (1–4) after each judgment.

Neutral concrete nouns; valence is **not** manipulated. **Item source is
counterbalanced** across participants via two inverse lists (A/B): every item
appears as both external and internal across participants, so `item_id` is not
confounded with `source_truth`. Each participant keeps a 50/50 split; A/B are
balanced within each condition. Assignment is reproducible under a locked,
block-specific seed. Practice items are separate from test items; feedback only
in practice.

## Endpoints

- **Primary (sole):** criterion `c`; estimand `Δc = c_decentering − c_active_control`;
  directional prediction `c_decentering > c_active_control`.
- **Discriminant control:** `d′` via the `condition × source_truth` interaction;
  expected ≈ 0 under the clean hypothesis.
- **Exploratory:** confidence, meta-d′ (non-hierarchical only), reaction time.
  Mean confidence is **not** a confirmatory endpoint. HMeta-d is excluded from
  Pilot A. "Attribution Window" is not used in the empirical layer.

## Confirmatory model (SPECIFICATION — not fitted in this reconstruction)

```
response_external ~ condition * source_truth + (1 + source_truth | participant_id)
family = binomial(link = "probit")
```

`condition` is between-participant → **no by-participant random slope for
condition**; random intercept + random slope for `source_truth` only. Grouping
factor is `participant_id` (matches the data). **Open decision (not locked):**
after counterbalancing, add a by-item random intercept `(1 | item_id)`, pending
identifiability/convergence checks and human approval. Fitting is deferred to a
validated environment (R `lme4::glmer`, probit); see `analysis_R/fit_glmm.R` and
`MODEL_SPECIFICATION.md`.

## Manipulation check (selective battery)

Immediately after the induction, measure **MPoD-s** (state decentering) plus five
matched dimensions: relaxation, distress, perceived effort, credibility/
expectancy, task engagement. A criterion effect is interpretable as
decentering-specific **only** if MPoD-s differs selectively while matched
dimensions show no meaningful difference **against predefined equivalence
margins** (not via non-significance). A `confounded_demand` pattern triggers the
failure rule.
