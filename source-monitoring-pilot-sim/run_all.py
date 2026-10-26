#!/usr/bin/env python3
"""Run the full synthetic pipeline for all five scenarios.

CANDIDATE / SYNTHETIC DATA ONLY. stdlib only. Writes trial-level data and
scenario summaries/verdicts to outputs/. Does NOT fit a GLMM and does NOT
produce inferential results.

Usage:  python3 run_all.py
"""
import csv
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src import config, generate, analyze, model_spec

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "outputs")
SCEN_DIR = os.path.join(OUT, "scenarios")

TRIAL_FIELDS = [
    "scenario", "participant_id", "condition", "list_assignment", "item_id",
    "encoding_source", "encoding_cue", "source_truth", "response_source",
    "response_external", "correct", "confidence", "reaction_time_ms",
    "practice_trial", "item_order", "source_assignment_seed",
]


def _write_trials(path, scenario, trial_rows):
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=TRIAL_FIELDS)
        w.writeheader()
        for r in trial_rows:
            row = {"scenario": scenario}
            row.update(r)
            w.writerow(row)


def main():
    os.makedirs(SCEN_DIR, exist_ok=True)

    spec = model_spec.emit_specification()
    with open(os.path.join(OUT, "model_specification.json"), "w") as f:
        json.dump(spec, f, indent=2)

    all_results = []
    contrast_rows = []
    mc_summary_rows = []

    for scenario in config.SCENARIO_ORDER:
        trial_rows, mc_rows = generate.generate_scenario(scenario)
        _write_trials(os.path.join(SCEN_DIR, f"{scenario}_trials.csv"), scenario, trial_rows)

        # participant-level manipulation-check export
        with open(os.path.join(SCEN_DIR, f"{scenario}_manipulation_check.csv"), "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["scenario", "participant_id", "condition"] + list(config.MC_DIMS))
            for pid, cond, fields in mc_rows:
                w.writerow([scenario, pid, cond] + [fields[d] for d in config.MC_DIMS])

        res = analyze.analyze_scenario(scenario, trial_rows, mc_rows)
        res["data_provenance"] = generate.DATA_PROVENANCE
        all_results.append(res)

        con = res["contrasts"]
        contrast_rows.append({
            "scenario": scenario,
            "dprime_control": con["dprime_control"],
            "dprime_decentering": con["dprime_decentering"],
            "c_control": con["c_control"],
            "c_decentering": con["c_decentering"],
            "delta_c": con["delta_c"],
            "delta_dprime": con["delta_dprime"],
            "manipulation_check_verdict": res["manipulation_check_verdict"],
            "final_interpretation": res["final_interpretation"],
        })
        means = res["manipulation_check_means"]
        row = {"scenario": scenario}
        for dim in config.MC_DIMS:
            row[f"{dim}__control"] = means["active_control"][dim]
            row[f"{dim}__decentering"] = means["decentering"][dim]
            row[f"{dim}__diff"] = round(means["decentering"][dim] - means["active_control"][dim], 4)
        mc_summary_rows.append(row)

    # contrasts summary
    with open(os.path.join(OUT, "scenario_contrasts.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(contrast_rows[0].keys()))
        w.writeheader()
        w.writerows(contrast_rows)

    # analysis summary (condition-level descriptive SDT)
    with open(os.path.join(OUT, "analysis_summary.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["scenario", "condition", "n", "mean_dprime", "mean_c"])
        for res in all_results:
            c = res["contrasts"]
            w.writerow([res["scenario"], "active_control", c["n_control"],
                        c["dprime_control"], c["c_control"]])
            w.writerow([res["scenario"], "decentering", c["n_decentering"],
                        c["dprime_decentering"], c["c_decentering"]])

    # manipulation-check summary
    with open(os.path.join(OUT, "manipulation_check_summary.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(mc_summary_rows[0].keys()))
        w.writeheader()
        w.writerows(mc_summary_rows)

    # full verdicts JSON
    with open(os.path.join(OUT, "verdicts.json"), "w") as f:
        json.dump(all_results, f, indent=2)

    # console report
    print("=" * 72)
    print("PILOT_A_PYTHON_RECONSTRUCTION_v1 — synthetic pipeline")
    print("CANDIDATE / SYNTHETIC DATA ONLY — descriptive + verdict logic, no GLMM fit")
    print("=" * 72)
    print(f"Confirmatory model (SPEC, not fitted): {spec['confirmatory_formula']}")
    print(f"By-participant random terms (validated): {spec['by_participant_random_terms']}")
    print("-" * 72)
    for r in contrast_rows:
        print(f"[{r['scenario']:>17}]  Δc={r['delta_c']:+.3f}  Δd'={r['delta_dprime']:+.3f}"
              f"  MC={r['manipulation_check_verdict']:<28}  -> {r['final_interpretation']}")
    print("-" * 72)
    print(f"Outputs written under: {OUT}")


if __name__ == "__main__":
    main()
