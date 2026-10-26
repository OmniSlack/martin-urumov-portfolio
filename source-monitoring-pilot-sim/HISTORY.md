# Revision history — source-monitoring-pilot-sim

English consolidation of the five revision reports shipped with the package (r2, r3, r3 power run, r5, r6; 2026-07-20/21). The reports themselves are not carried (see `PROVENANCE.md` for their hashes); every number below is taken from them or re-verified in this folder as marked. Reports attributed defects to "independent code verification", "independent methodological review" and task briefs; those reviews were performed by AI assistants under Martin Urumov's direction, and the fixes were implemented by AI assistants.

## r1 → r2 (2026-07-20) — independent code verification

| # | Finding | Fix | Check |
|---|---|---|---|
| 1 | **Item confounded with source**: every item always had the same source class, so an item effect was indistinguishable from a source effect (100/100 items confounded) | Two inverse item lists (A/B) assigned equally within both conditions; every participant keeps a 50/50 source split; every item appears under both source classes across participants | tests 20–22, 05 |
| 2 | Grouping factor named `participant` in some places and `participant_id` in others | `participant_id` everywhere (model spec, JSON, docs, R script, tests) | test 24 |
| 3 | Practice and test blocks recorded the base seed, not the seed that generated them | Block-specific seed on every row; test regenerates each block from its stored seed and compares the item→source mapping | test 23 |
| 4 | No item-level random effect in the model | `(1 | item_id)` added to the specification as an explicit **open** decision (identifiability to be checked) | test 25 |

Tests 19 → 26. Scenario verdicts unchanged (counterbalancing changes the design, not the response model).

## r2 → r3 (2026-07-21) — execution lock implemented

- Primary model now includes `(1 | item_id)` with a locked three-level convergence hierarchy (full → `||` uncorrelated → intercepts only); each fallback reported.
- `analysis_R/fit_glmm.R` implemented: `lme4::glmer`, probit, Δc and Δd′ estimands with delta-method SE, JSON output. Synthetic validation (reported, R 4.3 / lme4 1.1-35.1): `criterion_only` generating Δc = 0.45 → Δĉ = 0.443 ± 0.044; `null` → Δĉ = 0.023, p = 0.29; `sensitivity_only` generating Δd′ = 0.50 → Δd̂′ = 0.541 with Δĉ not significant. The model separates criterion from sensitivity and does not manufacture a Δc.
- Honest finding recorded in the report: on the Python-generated data the item term is singular by construction (no item variance in the generator), so the hierarchy correctly falls to intercepts-only and says so.
- `analysis_R/power_simulation.R`, `config/*.json` (SESOI Δc = 0.20, α = 0.05 one-sided, power 0.80, variance grid, n-grid, attrition — all marked CANDIDATE), `materials/` (two 6-minute scripts and a 110-slot stimulus placeholder, `validated=NO`).
- Tests 26 → 29.

## r3 power run (2026-07-21) — partial, disclosed

The locked task required 48 cells × 3 conditions × 1000 simulations ≈ 144,000 Laplace fits (then estimated at ≈ 134 CPU-hours; the environment had 2 cores). Executed instead: a stratified partial run — 25 simulations per cell on the full 48-cell primary grid and on a predefined 12-cell sub-grid for the null and sensitivity-only controls — 72 units × 25 = 1,800 simulations (`outputs/r_validation/power_full/`; row count verified here).

Reported results, all with `lock_complete=FALSE`: primary-effect power at 25 sims/cell from 0.64 (n = 40, worst cell) to ≥ 0.96 (n ≥ 80); null Type-I error 0.00–0.08, every CI containing 0.05; sensitivity-only false positives 0.00–0.12 with Δd̂′ recovered at 0.48–0.53 in all 12 cells; mean bias of Δĉ −0.002, RMSE 0.051, coverage 0.944; 164 fallback/singular rows kept by name in `power_full_failures.csv`; power computed over attempted fits. **No n recommended** — the robust rule (≥ 0.80 in every decision-relevant cell at 1000-simulation precision) cannot be applied to 25-simulation estimates. Reproducibility audit: unit 29 rerun from a clean directory with its recorded RNG stream was byte-identical.

Deviations disclosed in the report: 25 instead of 1000 simulations; controls on a sub-grid; `calc.derivs=FALSE` for speed; optional mixed condition skipped. The third deviation is what the next review caught.

## r4 → r5 (2026-07-21) — two defects in the power runner

| Defect (from the review) | What was wrong | Fix in `power_full_run_r5.R` | Check |
|---|---|---|---|
| **"duplication"** | The runner carried its own copy of the grid and of a scientific constant (Δd′ = 0.50 for the sensitivity-only condition) instead of reading `config/power_simulation.json`; production definition had a 12-cell shortcut | Config is read and validated fail-fast (key presence, ranges, `sims_full ≥ 1000`, model structure); Δd′ moved into the config; manifest lists all 144 units | test 30 |
| **"0 non-converged"** | With `calc.derivs=FALSE` the gradient was never inspected, so "object returned" was counted as "converged": 0/1800 non-converged in the r3 run | `calc.derivs=TRUE`; a level is accepted only if optimizer code = 0, max\|gradient\| < 0.002, no lme4 convergence message, non-singular; warnings captured and written, never suppressed; final fallback may return with an explicit `degraded_*` status | tests 33–34 |

Proof that the second fix bites: in the 24-simulation smoke run the new rule **rejected 6 of 30 attempts** that r4 would have counted as clean, with gradients up to **302.95** against the 0.002 tolerance (verified here from `power_r5_smoke/attempt_diagnostics.csv`). Also added: attempt-level diagnostics (one row per level tried per simulation), per-unit metadata (config hash, runner hash, RNG stream, environment, requested/completed counts), resume that skips a unit only on full match, and a `verify` mode with statuses COMPLETE / MISSING / HASH_MISMATCH / RNG_MISMATCH / REQUEST_MISMATCH / INCOMPLETE / META_UNREADABLE. Runtime projection from the instrumented smoke: ≈ 351 CPU-hours for 144 × 1000 (≈ 26 h on 16 cores) — the r3 estimate of 134 h had been computed without derivatives. Tests 29 → 35.

## r5 → r6 (2026-07-21) — hardening, five defects

| Defect | What was wrong | Fix in `power_full_run_r6.R` | Check |
|---|---|---|---|
| A — acceptance rule | `is.na(gr) \|\|` let a missing gradient pass | `is.finite(max_grad) && max_grad < 0.002`; missing / non-finite / above-tolerance each get their own status; the rule is a pure function proven on 9 injected cases | test 37 |
| B — Hessian and messages | `hess_ok` was recorded but not part of acceptance; messages matched by substring | Hessian positive-definiteness is part of acceptance; the message allow-list is explicitly empty (any non-empty convergence message rejects); full texts kept lossless in JSONL | test 37 |
| C — environment identity | Units from different environments could be mixed | Fingerprint (R, platform, lme4, Matrix, jsonlite, BLAS, LAPACK, La_version) in every unit's metadata; mismatch → `ENVIRONMENT_MISMATCH` | test 38 |
| D — completeness | A half-written unit could look complete | Schema check of result and attempts files, unique 1:N simulation IDs, SHA-256 of result/attempts/JSONL compared with metadata; **atomic completion** — data renamed first, metadata renamed last as the completion marker | tests 39–43 |
| E — aggregation | A partial aggregate could be read as a result | `aggregate` (strict) refuses with exit 1 below 144 units × 1000 sims; `aggregate_partial` writes `production_complete=FALSE` and the no-recommendation note | test 44 |

Corruption battery 10/10 (`integrity_test_results.csv`): baseline COMPLETE, eight mismatch statuses, strict-refusal exit 1 — each proven on a deliberately damaged copy. Transparency note in the report: on the first pass three cases returned CHECKSUM_MISMATCH instead of the more specific status; the bug was in the test harness (buffer not flushed before hashing), not in the verifier; fixed and recorded in the CSV. Tests 35 → 45.

## 2026-10-25 / 2026-10-26 — reproduction for this portfolio

- R 4.3.3, lme4 1.1.35.1, Matrix 1.6.5, jsonlite 1.8.8, reference BLAS/LAPACK — the same fingerprint the package recorded.
- `run_all.py` outputs byte-identical to the shipped `outputs/`. 45/45 on 2026-10-25; 43/45 on 2026-10-26 after the sandbox was re-provisioned: checks 35 and 45 compare a fresh unit 30 with the shipped bytes and now differ at the 6th–7th significant digit while two fresh runs agree with each other (`evidence/2026-10-26/DETERMINISM_CHECK.txt`). **Finding (AI, 2026-10-26): the r6 environment fingerprint is not sufficient for byte-level reproducibility across hosts**, so defect C is closed only within one machine. Not fixed here: the fix would change the recorded hashes of the shipped units and the run packet; it belongs in an r7 with a new fingerprint (CPU model, maths-library build) and regenerated smoke outputs.
- Production run still never executed.
