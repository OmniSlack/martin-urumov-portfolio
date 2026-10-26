# DATA_DICTIONARY — reconstruction (CANDIDATE)

Synthetic data only. Participant ids follow the pattern `SYN-<scenario>-<C|D><nnn>`.

## Trial-level fields (`outputs/scenarios/<scenario>_trials.csv`)

| Field | Type | Level | Definition |
|---|---|---|---|
| `scenario` | string | dataset | one of null, small_positive, criterion_only, sensitivity_only, confounded_demand |
| `participant_id` | string | participant | synthetic id (`SYN-...`); no personal data |
| `condition` | enum | participant | `active_control` (0) or `decentering` (1); between-participant |
| `list_assignment` | enum | participant | counterbalancing list `A` or `B` (inverse source maps); balanced within each condition |
| `item_id` | string | trial | neutral concrete-noun token |
| `encoding_source` | enum | trial | `perceived_external` or `imagined_internal` |
| `encoding_cue` | enum | trial | `SHOW_WORD` (perceived) or `IMAGINE_WORD` (imagined) |
| `source_truth` | binary | trial | 1 = external/perceived (signal); 0 = internal/imagined (noise) |
| `response_source` | enum | trial | `external` / `internal` |
| `response_external` | binary | trial | 1 = responded "external"; model outcome |
| `correct` | binary | trial | response_external == source_truth |
| `confidence` | int 1–4 | trial | sequential post-decision confidence; **exploratory** |
| `reaction_time_ms` | int | trial | simulated; **exploratory**; NOT an Attribution-Window measure |
| `practice_trial` | binary | trial | 1 = practice (feedback allowed); 0 = test |
| `item_order` | int | trial | randomized presentation index within block |
| `source_assignment_seed` | int | trial | **block-specific** seed that actually generated this row's block (test vs practice); reproducible item→source map |

## Participant-level manipulation-check fields (`outputs/scenarios/<scenario>_manipulation_check.csv`)

| Field | Type | Definition |
|---|---|---|
| `mpod_s_state_decentering` | numeric | **target** — Metacognitive Processes of Decentering, state (MPoD-s) |
| `relaxation_state` | numeric | matched — must not differ meaningfully |
| `distress_state` | numeric | matched |
| `perceived_effort` | numeric | matched |
| `credibility_expectancy` | numeric | matched |
| `task_engagement` | numeric | matched |

## Derived / summary outputs

- `outputs/analysis_summary.csv` — per scenario × condition: n, mean d′, mean c (descriptive).
- `outputs/scenario_contrasts.csv` — Δc, Δd′, manipulation-check verdict, final interpretation.
- `outputs/manipulation_check_summary.csv` — per-dimension condition means and diffs.
- `outputs/verdicts.json` — full per-scenario detail (contrasts, MC details, verdicts).
- `outputs/model_specification.json` — emitted confirmatory-model spec (not fitted).

## Verdict vocabularies

- **manipulation_check_verdict:** `selective_pass`, `failed_no_decentering_effect`,
  `confounded_relaxation`, `confounded_distress`, `confounded_effort`,
  `confounded_expectancy`, `confounded_engagement`.
- **final_interpretation:** `SUPPORTS_decentering_specific_criterion_effect`,
  `NO_criterion_effect_decentering_induced_kill`,
  `SENSITIVITY_effect_hypothesis_unsupported`,
  `MIXED_criterion_and_sensitivity_needs_followup`,
  `MANIPULATION_FAILED_uninterpretable_for_mechanism`,
  `CONFOUNDED_criterion_present_mechanism_unsupported`,
  `CONFOUNDED_no_clean_criterion_effect`.

## Counterbalancing note

Item source is **counterbalanced** across participants via two inverse lists
(`A`/`B`). Every test item appears as both `perceived_external` and
`imagined_internal` across participants; `item_id` is therefore **not** confounded
with `source_truth`. Each participant still sees a 50/50 source split; A/B are
balanced within each condition. Model grouping factor is `participant_id`
(matches the data column).

## Generating-truth note

`generating d′` / `generating c` are latent settings inside the generator and are
not exported as observed columns (they would be unavailable in real data).
