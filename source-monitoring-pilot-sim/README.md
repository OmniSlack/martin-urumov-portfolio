# source-monitoring-pilot-sim

**Kind:** simulation and test harness (Python 3 standard library; R 4.3 + `lme4` + `jsonlite` for the statistical layer) · **Status:** synthetic prototype; no real participants, no preregistration, no production power run · **Dates:** r1–r6 built 2026-07-20/21; reproduced 2026-10-25 and 2026-10-26

## Purpose

A synthetic end-to-end pipeline for a between-participant source-monitoring experiment (did a participant perceive an item or imagine it?) in which the quantity of interest is a shift in response **criterion** (c) with no change in **sensitivity** (d′). The pipeline exists to prove the *machinery* before any human data: that the design is balanced, that the planned confirmatory model is the one that gets fitted, that a power simulation cannot silently count a non-converged fit as a result, and that a partial run can never be mistaken for a complete one.

It is a reconstruction from documentation of an earlier prototype whose source was lost. Everything in it is synthetic. It validates no hypothesis.

## How it works

Three layers, each with its own check:

1. **Python generator and verdict logic** (`src/`, `run_all.py`): five synthetic scenarios (`null`, `small_positive`, `criterion_only`, `sensitivity_only`, `confounded_demand`) → trial-level data with an encoding phase, A/B inverse item lists so that no item is tied to one source, block-specific seeds recorded on every row → descriptive d′ and c (log-linear corrected) → a selective manipulation-check battery → one machine-readable verdict per scenario. The confirmatory formula is emitted, not fitted, here:
   `response_external ~ condition * source_truth + (1 + source_truth | participant_id) + (1 | item_id)`, probit link.
2. **R fit** (`analysis_R/fit_glmm.R`): `lme4::glmer` probit with a locked three-level convergence hierarchy (full → uncorrelated slopes → intercepts only); every fallback is reported. Estimands: Δc = −(b_condition + ½·b_interaction), Δd′ = b_interaction, delta-method SE.
3. **Power runner** (`analysis_R/power_full_run_r6.R`, config in `config/power_simulation.json`): 48 cells (3 sd_c × 2 sd_item × 4 n × 2 attrition) × 3 conditions = **144 units** × 1000 simulations. Each unit is resumable with its own recorded RNG stream and is `COMPLETE` only if result, attempts, lossless JSONL diagnostics and metadata all exist, their schemas match, their SHA-256 match the metadata, the config/runner hashes match, and the environment fingerprint matches. A fit is accepted only if the optimizer code is 0, `max|gradient| < 0.002`, the Hessian is positive-definite, no convergence message was emitted and the fit is non-singular; everything else is recorded and falls back down the hierarchy. `aggregate` refuses (exit 1) unless all 144 units are complete at 1000 simulations; `aggregate_partial` always writes `production_complete=FALSE` and the note that no sample-size recommendation may be derived.

`HISTORY.md` records how each of these rules came to exist — every one of them closes a defect found in an earlier revision.

## How to run

```bash
python3 run_all.py            # synthetic pipeline → outputs/ (compare with the shipped copies; they should be byte-identical)
python3 tests/run_tests.py    # 45 checks; exits non-zero on any failure (checks 30–45 need Rscript + lme4 + jsonlite)

# statistical layer (synthetic validation only)
Rscript analysis_R/fit_glmm.R outputs/scenarios/criterion_only_trials.csv /tmp/fit.json
Rscript analysis_R/power_full_run_r6.R run <out_dir> 4 1 30      # one unit, 4 simulations (smoke)
Rscript analysis_R/power_full_run_r6.R verify <out_dir>           # per-unit status
Rscript analysis_R/power_full_run_r6.R aggregate <out_dir>        # strict: refuses anything below 144 × 1000
python3 tools/determinism_check.py .                              # rerun unit 30 twice, compare with the shipped reference
```

Note: checks 43–44 of the test suite run `aggregate` / `aggregate_partial` on the shipped smoke directory and **rewrite** `outputs/r_validation/power_r6_smoke/run_manifest.json` and `unit_manifest.csv`. Restore them afterwards (`git checkout -- outputs/r_validation/power_r6_smoke/`) before comparing hashes.

`r-run-packet/` is the minimal two-file packet (runner + config + their hash list) for running the production simulation on another machine; its files are byte-identical to the ones in `analysis_R/` and `config/`.

## Evidence

| Claim | Where | Observed |
|---|---|---|
| `run_all.py` reproduces the shipped `outputs/` byte for byte | [`evidence/2026-10-26/RUN_ALL.txt`](evidence/2026-10-26/RUN_ALL.txt) | **Reproduced** |
| 45/45 checks pass | [`evidence/2026-10-25/TESTS.txt`](evidence/2026-10-25/TESTS.txt) | **Reproduced** 2026-10-25 in this sandbox |
| 43/45 one day later, same R/lme4/BLAS; checks 35 and 45 (byte-identical rerun against the shipped reference) fail | [`evidence/2026-10-26/TESTS.txt`](evidence/2026-10-26/TESTS.txt), [`DETERMINISM_CHECK.txt`](evidence/2026-10-26/DETERMINISM_CHECK.txt) | **Reproduced** — see Limitations, first item |
| Shipped smoke runs: 24 simulations, 30 attempts, **6 attempts rejected** by the strict acceptance rule (largest gradient 302.95 against the 0.002 tolerance) | `outputs/r_validation/power_r5_smoke/attempt_diagnostics.csv`, `power_r6_smoke/attempt_diagnostics.csv` | **Verified** by counting the rows |
| r3 partial power run: 72 units × 25 simulations = 1,800 rows, 164 fallback rows kept by name, every cell marked `lock_complete=FALSE` | `outputs/r_validation/power_full/` | **Verified** (row counts); run itself **Reported** |
| Verifier statuses proven on deliberately corrupted artefacts, 10/10 | `outputs/r_validation/power_r6_smoke/integrity_test_results.csv` | **Read** (the corruption battery is inside the test suite, checks 36–44, which pass) |
| Strict `aggregate` refuses the smoke directory with exit 1 | test 44; `run_manifest.json` shows `production_complete=false`, 138 MISSING + 6 REQUEST_MISMATCH | **Reproduced** |
| Shipped hash lists: runner and config hashes in `power_r5_smoke/hashes.txt` and `power_r6_smoke/hashes.txt` match | `sha256sum -c` from the folder root | **Verified**; `power_full/power_full_hashes.txt` (r3) no longer matches `config/power_simulation.json`, which r5 changed on purpose — expected |

The full 144 × 1000 production run was never executed (projected ≈ 351 CPU-hours). No sample size is recommended anywhere in this folder, by design.

## Limitations

- **"Deterministic" holds within one machine, not across machines with the same fingerprint.** The r6 environment identity records R, lme4, Matrix, jsonlite, BLAS and LAPACK. On 2026-10-25 this sandbox reproduced the shipped unit 30 byte for byte (45/45). On 2026-10-26, after the sandbox was re-provisioned, the fingerprint was identical character for character and the estimates differed from the reference at the 6th–7th significant digit (`dc_hat` 0.123589042647375 vs 0.12358836745297; `max_grad` 0.00080 vs 0.00027); two fresh runs on 2026-10-26 were byte-identical to each other. The fingerprint therefore does not capture everything that determines the bytes (CPU model and the maths-library code paths selected at run time are the likely missing items; not proven). Consequence: the verifier would accept units computed on different hosts as one consistent run. A production run should be done on one machine, or the fingerprint extended. Found 2026-10-26 during this reproduction, by the AI assistant.
- The test suite writes into the shipped smoke directory (see How to run).
- The GLMM is fitted only in the R layer; the Python layer is descriptive. The original README of the package says in one place that the fit is "not executed here" and in another that it is "implemented" — both are true of different layers, and the sentence was never reconciled.
- All effect sizes, variance grids, the SESOI (Δc = 0.20) and the equivalence margins (±10 on a 0–100 scale) are candidate values set for the harness, not empirically justified.
- The item random effect `(1 | item_id)` is singular on the Python-generated data (the generator has no item variance), so the hierarchy correctly falls to intercepts-only there; in the R power generator, which has item variance, the full model converged in 100 % of the r3 fits (reported, not re-run here).
- The materials under `materials/` are placeholders (the stimulus list carries `validated=NO`); the manipulation-check questionnaire is referenced by configuration only, without item text.
- Header comments in the R runners name the instruction document each revision implemented (`CODEX_TASK__…`); the words CANDIDATE / ACTIVE / CANON in two docstrings are the original project's status vocabulary (CANDIDATE = not approved for any use). The files are kept byte-identical because the shipped unit metadata and the run packet carry their hashes.

## Provenance

See [`PROVENANCE.md`](PROVENANCE.md). Source: `PILOT_A_PYTHON_RECONSTRUCTION_v1_r6.zip` (SHA-256 `964d602f…5646b`), received twice under two names, identical. Carried byte-identical: `src/`, `tests/`, `run_all.py`, `analysis_R/`, `config/`, `materials/`, `outputs/`, and the four methods documents. Not carried: the package README and the five revision reports (mixed-language, signed project records) — their content is consolidated in English in `HISTORY.md`, with their hashes listed in `PROVENANCE.md`. Added: `r-run-packet/`, `tools/determinism_check.py`, `evidence/`.

## Contribution

- Martin Urumov: the control decisions at every revision — what is locked and what stays an open human decision; that incomplete runs are disclosed cell by cell and never produce a sample-size recommendation; the instruction briefs for r2–r6; review and acceptance of each revision. Found nine of the eleven defects recorded in `HISTORY.md` (item/source confound, two names for one factor, wrong block seed, missing item effect, duplicated configuration, missing-gradient acceptance, Hessian not part of acceptance, mixing of environments, partial aggregate readable as a result), and noticed the tenth — the "0 non-converged" run — by watching the fits finish in a fraction of a second and asking why; the assistant established the cause.
- AI assistants: the Python reconstruction, the R scripts, the 45 checks, the written review documents, the completeness defect (half-written unit looked complete), the 2026-10-25/26 reproduction, the determinism finding above, and the preparation of this folder.
