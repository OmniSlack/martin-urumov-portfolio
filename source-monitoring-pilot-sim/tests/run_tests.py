#!/usr/bin/env python3
"""Test suite for PILOT_A_PYTHON_RECONSTRUCTION_v1 (revised; stdlib only).

CANDIDATE. Exercises structure, counterbalancing, verdict logic, provenance, and
boundaries. No GLMM is fitted. Exits non-zero if any test fails.
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from src import (config, task, sdt, generate, analyze, model_spec,  # noqa: E402
                 manipulation_check as mc)

_results = []


def check(name, cond, detail=""):
    _results.append((name, bool(cond), detail))


_SCEN = {}
def scen(name):
    if name not in _SCEN:
        tr, mcr = generate.generate_scenario(name)
        _SCEN[name] = (tr, mcr, analyze.analyze_scenario(name, tr, mcr))
    return _SCEN[name]


def _test_rows(tr):
    return [r for r in tr if r["practice_trial"] == 0]


# 1 + 2. between-participant; no within-participant condition variation
def t_between():
    tr, _, _ = scen("small_positive")
    pid_cond = {}
    ok = True
    for r in tr:
        c = pid_cond.setdefault(r["participant_id"], r["condition"])
        if c != r["condition"]:
            ok = False
    check("01_between_participant_assignment", ok, f"{len(pid_cond)} participants")
    check("02_no_within_participant_condition_variation", ok)


# 3. no random slope for condition
def t_random_structure():
    ok_locked = model_spec.validate_random_structure(model_spec.LOCKED_BY_PARTICIPANT_TERMS)
    rejected = False
    try:
        model_spec.validate_random_structure(["1", "condition"])
    except model_spec.RandomStructureError:
        rejected = True
    check("03_no_condition_random_slope", ok_locked and rejected)


# 4. balanced encoding source (50/50 per participant test trials)
def t_balance():
    tr, _, _ = scen("null")
    by_pid = {}
    for r in _test_rows(tr):
        by_pid.setdefault(r["participant_id"], []).append(r["source_truth"])
    ok = all(sum(v) == config.N_TEST_TRIALS // 2 for v in by_pid.values())
    check("04_balanced_encoding_source", ok, "exact 50/50 per participant")


# 5. counterbalanced lists deterministic and inverse
def t_cb_deterministic():
    a1 = task.build_counterbalanced_lists(123, task.TEST_ITEMS)
    a2 = task.build_counterbalanced_lists(123, task.TEST_ITEMS)
    inverse = all(a1["A"][it] != a1["B"][it] for it in task.TEST_ITEMS)
    diff_seed = task.build_counterbalanced_lists(999, task.TEST_ITEMS)
    check("05_counterbalance_deterministic_and_inverse",
          a1 == a2 and inverse and a1 != diff_seed)


# 6. clean selective manipulation-check pass
def t_selective_pass():
    means = {
        "active_control": {d: config.MC_BASE[d] for d in config.MC_DIMS},
        "decentering": {d: config.MC_BASE[d] for d in config.MC_DIMS},
    }
    means["decentering"]["mpod_s_state_decentering"] += 1.5
    v, _ = mc.manipulation_check_verdict(means)
    check("06_clean_selective_pass", v == "selective_pass", v)


# 7. failed manipulation with no MPoD-s effect
def t_failed_manip():
    means = {
        "active_control": {d: config.MC_BASE[d] for d in config.MC_DIMS},
        "decentering": {d: config.MC_BASE[d] for d in config.MC_DIMS},
    }
    v, _ = mc.manipulation_check_verdict(means)
    check("07_failed_no_decentering_effect", v == "failed_no_decentering_effect", v)


# 8. confounded-demand failure
def t_confound():
    _, _, res = scen("confounded_demand")
    scen_ok = (res["manipulation_check_verdict"].startswith("confounded_")
               and res["final_interpretation"] == "CONFOUNDED_criterion_present_mechanism_unsupported")
    means = {
        "active_control": {d: config.MC_BASE[d] for d in config.MC_DIMS},
        "decentering": {d: config.MC_BASE[d] for d in config.MC_DIMS},
    }
    means["decentering"]["mpod_s_state_decentering"] += 1.5
    means["decentering"]["credibility_expectancy"] += 1.2
    v, _ = mc.manipulation_check_verdict(means)
    check("08_confounded_demand_failure", scen_ok and v == "confounded_expectancy",
          f"scenario={res['manipulation_check_verdict']}/{res['final_interpretation']}; crafted={v}")


# 9. criterion-only interpretation
def t_criterion_only():
    _, _, res = scen("criterion_only")
    check("09_criterion_only_supports",
          res["manipulation_check_verdict"] == "selective_pass"
          and res["final_interpretation"] == "SUPPORTS_decentering_specific_criterion_effect",
          f"Δc={res['contrasts']['delta_c']} Δd'={res['contrasts']['delta_dprime']}")


# 10. sensitivity-only interpretation
def t_sensitivity_only():
    _, _, res = scen("sensitivity_only")
    check("10_sensitivity_only_unsupported",
          res["manipulation_check_verdict"] == "selective_pass"
          and res["final_interpretation"] == "SENSITIVITY_effect_hypothesis_unsupported",
          f"Δc={res['contrasts']['delta_c']} Δd'={res['contrasts']['delta_dprime']}")


# 11. mixed criterion + sensitivity (crafted)
def t_mixed():
    interp = analyze.final_interpretation(0.30, 0.40, "selective_pass")
    check("11_mixed_interpretation", interp == "MIXED_criterion_and_sensitivity_needs_followup", interp)


# 12. confidence and RT remain exploratory
def t_exploratory():
    spec = model_spec.emit_specification()
    f = spec["confirmatory_formula"]
    ok = ("confidence" not in f and "reaction_time" not in f
          and spec["primary_endpoint"].startswith("criterion c"))
    check("12_confidence_rt_exploratory", ok)


# 13. no HMeta-d / out-of-scope implementations
def t_no_forbidden():
    forbidden = ("hmeta", "hgf", "ddm", "drift", "neuro", "arousal", "clinical")
    import importlib
    bad = []
    for modname in ("config", "task", "sdt", "generate", "analyze",
                    "model_spec", "manipulation_check"):
        module = importlib.import_module(f"src.{modname}")
        for attr in dir(module):
            if callable(getattr(module, attr)) and any(t in attr.lower() for t in forbidden):
                bad.append(f"{modname}.{attr}")
    check("13_no_hmeta_or_out_of_scope_impl", not bad, ";".join(bad))


# 14. no real personal / participant data
def t_synthetic_only():
    tr, mcr, _ = scen("null")
    ok = (generate.DATA_PROVENANCE == "SYNTHETIC"
          and all(r["participant_id"].startswith("SYN-") for r in tr)
          and all(pid.startswith("SYN-") for pid, _c, _f in mcr))
    check("14_synthetic_data_only", ok)


# 15-17. descriptive SDT sanity (ported)
def t_sdt_sanity():
    r0 = sdt.loglinear_rate(0, 50)
    r1 = sdt.loglinear_rate(50, 50)
    bounds = (0.0 < r0 < 0.5) and (0.5 < r1 < 1.0)
    dpr, _c = sdt.dprime_c(40, 50, 10, 50)
    _dpr2, c_sym = sdt.dprime_c(25, 50, 25, 50)
    check("15_extreme_rate_bounds", bounds, f"r0={r0:.3f} r1={r1:.3f}")
    check("16_dprime_positive_when_hits_gt_fa", dpr > 0, f"d'={dpr:.3f}")
    check("17_criterion_zero_when_symmetric", abs(c_sym) < 1e-9, f"c={c_sym:.3e}")


# 18-19. scenario sanity
def t_null():
    _, _, res = scen("null")
    check("18_null_kill_verdict",
          res["manipulation_check_verdict"] == "selective_pass"
          and res["final_interpretation"] == "NO_criterion_effect_decentering_induced_kill",
          f"Δc={res['contrasts']['delta_c']} Δd'={res['contrasts']['delta_dprime']}")


def t_small_positive():
    _, _, res = scen("small_positive")
    check("19_small_positive_supports",
          res["final_interpretation"] == "SUPPORTS_decentering_specific_criterion_effect",
          f"Δc={res['contrasts']['delta_c']} Δd'={res['contrasts']['delta_dprime']}")


# ---- Revision tests (item/source counterbalancing, alignment, provenance) ----

# 20. every test item appears under BOTH source classes across participants
def t_item_both_sources():
    tr, _, _ = scen("small_positive")
    seen = {}
    for r in _test_rows(tr):
        seen.setdefault(r["item_id"], set()).add(r["source_truth"])
    ok = len(seen) == config.N_TEST_TRIALS and all(s == {0, 1} for s in seen.values())
    bad = [it for it, s in seen.items() if s != {0, 1}]
    check("20_item_appears_both_source_classes", ok, f"{len(bad)} confounded items")


# 21. A/B lists equally represented within each condition
def t_list_balance():
    tr, _, _ = scen("null")
    counts = {}
    seen_pid = set()
    for r in tr:
        if r["participant_id"] in seen_pid:
            continue
        seen_pid.add(r["participant_id"])
        counts.setdefault(r["condition"], {"A": 0, "B": 0})[r["list_assignment"]] += 1
    ok = all(c["A"] == c["B"] == config.N_PER_GROUP // 2 for c in counts.values())
    check("21_ab_lists_balanced_within_condition", ok, str(counts))


# 22. item frequency identical across conditions
def t_item_freq_identical():
    tr, _, _ = scen("null")
    freq = {"active_control": {}, "decentering": {}}
    for r in _test_rows(tr):
        freq[r["condition"]][r["item_id"]] = freq[r["condition"]].get(r["item_id"], 0) + 1
    ok = freq["active_control"] == freq["decentering"]
    check("22_item_frequency_identical_across_conditions", ok)


# 23. block-specific seed provenance: regenerate each block from stored seed
def t_seed_provenance():
    tr, _, _ = scen("small_positive")
    # pick one participant, verify both blocks regenerate from their stored seeds
    pid = tr[0]["participant_id"]
    prows = [r for r in tr if r["participant_id"] == pid]
    ok = True
    for practice_flag, items in ((1, task.PRACTICE_ITEMS), (0, task.TEST_ITEMS)):
        block = [r for r in prows if r["practice_trial"] == practice_flag]
        if not block:
            ok = False
            break
        stored_seed = block[0]["source_assignment_seed"]
        la = block[0]["list_assignment"]
        rebuilt = task.build_counterbalanced_lists(stored_seed, items)[la]
        for r in block:
            if rebuilt[r["item_id"]] != r["encoding_source"]:
                ok = False
    check("23_block_specific_seed_provenance", ok,
          "each block regenerates from the seed stored in its rows")


# 24. participant_id alignment across model spec and data
def t_pid_alignment():
    spec = model_spec.emit_specification()
    f = spec["confirmatory_formula"]
    tr, _, _ = scen("null")
    data_has = all("participant_id" in r for r in tr[:5])
    formula_ok = "participant_id" in f and "| participant)" not in f
    check("24_participant_id_alignment", data_has and formula_ok
          and spec["grouping_factor"] == "participant_id", f)


# 25. item random intercept present per EXECUTION LOCK; hierarchy has 3 levels
def t_item_random_decision():
    spec = model_spec.emit_specification()
    d = spec.get("item_random_effect_decision", {})
    hier = spec.get("convergence_hierarchy", [])
    ok = ("(1 | item_id)" in spec["confirmatory_formula"]
          and "EXECUTION_LOCK" in d.get("status", "")
          and len(hier) == 3
          and all("(1 | item_id)" in f for f in hier)
          and "||" in hier[1])
    check("25_item_random_effect_locked_with_hierarchy", ok)


# 26. reproducibility: two generations of a scenario are byte-identical
def t_reproducible_scenario():
    a, _ = generate.generate_scenario("criterion_only")
    b, _ = generate.generate_scenario("criterion_only")
    check("26_scenario_generation_reproducible", a == b)


# 27. config/analysis.json consistent with lock and model spec
def t_config_analysis():
    import json
    with open(os.path.join(ROOT, "config", "analysis.json")) as f:
        cfg = json.load(f)
    spec = model_spec.emit_specification()
    ok = (cfg["sesoi_delta_c"] == 0.20
          and cfg["alpha_one_sided"] == 0.05
          and cfg["power_target"] == 0.80
          and cfg["primary_model"] == spec["confirmatory_formula"]
          and cfg["convergence_hierarchy"] == spec["convergence_hierarchy"]
          and cfg["statistical_environment"]["package"] == "lme4"
          and cfg["statistical_environment"]["link"] == "probit"
          and "CANDIDATE" in cfg["sesoi_status"])
    check("27_config_analysis_matches_lock_and_spec", ok)


# 28. config/task.json and manipulation_check.json consistent with lock + code
def t_config_task_mc():
    import json
    with open(os.path.join(ROOT, "config", "task.json")) as f:
        t = json.load(f)
    with open(os.path.join(ROOT, "config", "manipulation_check.json")) as f:
        m = json.load(f)
    ok = (t["practice_trials"] == config.N_PRACTICE_TRIALS == 10
          and t["test_trials"] == config.N_TEST_TRIALS == 100
          and t["source_balance"]["perceived_external"] == 50
          and t["counterbalancing"]["lists"] == ["A", "B"]
          and m["equivalence_margin_points"] == 10
          and "CANDIDATE" in m["equivalence_margin_status"]
          and "NOT reproduced" in m["state_decentering"]["item_text_policy"])
    check("28_config_task_and_mc_match_lock", ok)


# 29. R implementation + version-controlled materials exist and carry the lock
def t_r_and_materials():
    fit_p = os.path.join(ROOT, "analysis_R", "fit_glmm.R")
    pow_p = os.path.join(ROOT, "analysis_R", "power_simulation.R")
    ok = os.path.exists(fit_p) and os.path.exists(pow_p)
    if ok:
        fit = open(fit_p).read(); pw = open(pow_p).read()
        ok = ("(1 + source_truth | participant_id) + (1 | item_id)" in fit
              and 'link = "probit"' in fit
              and "SYNTHETIC" in fit.upper()
              and "0.05" not in ""  # noqa placeholder
              and "sesoi" in pw.lower())
    mats = ["decentering_script_v0.md", "active_control_script_v0.md",
            "stimulus_list_v0.csv"]
    ok_m = all(os.path.exists(os.path.join(ROOT, "materials", m)) for m in mats)
    if ok_m:
        with open(os.path.join(ROOT, "materials", "stimulus_list_v0.csv")) as f:
            n_rows = sum(1 for _ in f) - 1
        ok_m = n_rows == 110
    check("29_r_implementation_and_materials_versioned", ok and ok_m,
          "fit_glmm.R + power_simulation.R + 3 materials (110 stimulus slots)")


# ---- r5 runner tests (30-35) ----
import subprocess, shutil, tempfile, json as _json

_R5 = os.path.join(ROOT, "analysis_R", "power_full_run_r5.R")
_SMOKE = os.path.join(ROOT, "outputs", "r_validation", "power_r5_smoke")


def _rscript(*a):
    return subprocess.run(["Rscript", _R5] + list(a), capture_output=True, text=True)


# 30. production manifest: 144 units, 48 per condition, config-driven grid
def t_manifest_144():
    import csv as _csv, json
    mf = list(_csv.DictReader(open(os.path.join(_SMOKE, "unit_manifest.csv"))))
    conds = {}
    for r in mf:
        conds[r["cond"]] = conds.get(r["cond"], 0) + 1
    with open(os.path.join(ROOT, "config", "power_simulation.json")) as f:
        cfg = json.load(f)
    sdc = sorted({float(r["sd_c"]) for r in mf})
    ns = sorted({int(r["n_grp"]) for r in mf})
    ok = (len(mf) == 144
          and conds == {"A_primary": 48, "B_null": 48, "C_sensitivity_only": 48}
          and sdc == sorted(cfg["variance_grid"]["sd_c_participant"])
          and ns == sorted(cfg["n_per_group_grid"])
          and all(r["sims_requested"] == str(cfg["n_simulations_full"]) for r in mf))
    check("30_manifest_144_units_config_driven", ok, f"{len(mf)} units, {conds}")


# 31. config/code hash enforcement
def t_hash_enforcement():
    tmp = tempfile.mkdtemp(); os.makedirs(os.path.join(tmp, "units"))
    for f in os.listdir(os.path.join(_SMOKE, "units")):
        if f.startswith("unit_030"):
            shutil.copy(os.path.join(_SMOKE, "units", f), os.path.join(tmp, "units", f))
    mp = os.path.join(tmp, "units", "unit_030_meta.json")
    m = _json.load(open(mp)); m["config_hash"] = "deadbeef" * 8
    _json.dump(m, open(mp, "w"))
    r = _rscript("verify", tmp, "30", "4")
    check("31_config_hash_enforcement", r.returncode == 1 and "HASH_MISMATCH" in r.stdout,
          r.stdout.strip())


# 32. incomplete-unit detection (row count, not file existence)
def t_incomplete_detection():
    tmp = tempfile.mkdtemp(); os.makedirs(os.path.join(tmp, "units"))
    for f in os.listdir(os.path.join(_SMOKE, "units")):
        if f.startswith("unit_030"):
            shutil.copy(os.path.join(_SMOKE, "units", f), os.path.join(tmp, "units", f))
    rp = os.path.join(tmp, "units", "unit_030.csv")
    lines = open(rp).readlines(); open(rp, "w").writelines(lines[:3])
    r = _rscript("verify", tmp, "30", "4")
    ok_inc = r.returncode == 1 and "INCOMPLETE" in r.stdout
    r2 = _rscript("verify", _SMOKE, "30", "4")
    check("32_incomplete_unit_detection", ok_inc and r2.returncode == 0
          and "COMPLETE" in r2.stdout, f"{r.stdout.strip()}/{r2.stdout.strip()}")


# 33. convergence diagnostics actually captured
def t_convergence_capture():
    import csv as _csv
    atts = list(_csv.DictReader(open(os.path.join(_SMOKE, "attempt_diagnostics.csv"))))
    cols = set(atts[0].keys())
    need = {"unit_id", "sim", "level", "returned", "error_text", "opt_code",
            "conv_msgs", "max_grad", "hess_ok", "singular", "elapsed_s",
            "n_warnings", "warning_text", "accepted", "fallback_reason"}
    rejected = [a for a in atts if a["accepted"] == "FALSE"]
    grads = [a for a in atts if a["max_grad"] not in ("", "NA")]
    ok = (need <= cols and len(rejected) >= 1 and len(grads) == len(atts)
          and any(float(a["max_grad"]) >= 0.002 for a in rejected))
    check("33_convergence_diagnostics_captured", ok,
          f"{len(atts)} attempts, {len(rejected)} rejected with real gradient values")


# 34. fallback reason capture + hierarchy walk recorded
def t_fallback_capture():
    import csv as _csv
    atts = list(_csv.DictReader(open(os.path.join(_SMOKE, "attempt_diagnostics.csv"))))
    reasons = {a["fallback_reason"] for a in atts if a["accepted"] == "FALSE"}
    levels = {a["level"] for a in atts}
    res = []
    for f in os.listdir(os.path.join(_SMOKE, "units")):
        if f.endswith(".csv") and "attempts" not in f:
            res += list(_csv.DictReader(open(os.path.join(_SMOKE, "units", f))))
    chosen_levels = {r["level"] for r in res}
    ok = ("nonconverged" in " ".join(reasons) and {"full", "unc"} <= levels
          and "unc" in chosen_levels and all(r["status"] != "" for r in res))
    check("34_fallback_reason_captured", ok, f"reasons={reasons}, chosen={chosen_levels}")


# 35. deterministic selected-unit rerun (statistical bytes identical)
def t_deterministic_rerun():
    import csv as _csv
    tmp = tempfile.mkdtemp()
    r = _rscript("run", tmp, "4", "1", "30")
    a = open(os.path.join(_SMOKE, "units", "unit_030.csv"), "rb").read()
    b = open(os.path.join(tmp, "units", "unit_030.csv"), "rb").read()
    def noel(p):
        rows = list(_csv.DictReader(open(p)))
        return [{k: v for k, v in r.items() if k != "elapsed_s"} for r in rows]
    att_same = noel(os.path.join(_SMOKE, "units", "unit_030_attempts.csv")) == \
               noel(os.path.join(tmp, "units", "unit_030_attempts.csv"))
    check("35_deterministic_selected_unit_rerun", a == b and att_same,
          "results byte-identical; attempts identical modulo elapsed_s")


# ---- r6 hardening tests (36-45) ----
_R6 = os.path.join(ROOT, "analysis_R", "power_full_run_r6.R")
_SMOKE6 = os.path.join(ROOT, "outputs", "r_validation", "power_r6_smoke")


def _r6(*a):
    return subprocess.run(["Rscript", _R6] + list(a), capture_output=True, text=True)


def _copy_unit30(tmp):
    os.makedirs(os.path.join(tmp, "units"), exist_ok=True)
    for f in os.listdir(os.path.join(_SMOKE6, "units")):
        if f.startswith("unit_030"):
            shutil.copy(os.path.join(_SMOKE6, "units", f), os.path.join(tmp, "units", f))


def _tamper_result(tmp, mutate, drop_col=None):
    import csv as _csv, hashlib
    p = os.path.join(tmp, "units", "unit_030.csv")
    rows = list(_csv.DictReader(open(p)))
    cols = [c for c in rows[0] if c != drop_col] if drop_col else list(rows[0])
    if mutate:
        mutate(rows)
    f = open(p, "w", newline="")
    w = _csv.DictWriter(f, fieldnames=cols); w.writeheader()
    for r in rows:
        w.writerow({k: r.get(k, "") for k in cols})
    f.close()
    sha = hashlib.sha256(open(p, "rb").read()).hexdigest()
    mp = os.path.join(tmp, "units", "unit_030_meta.json")
    m = _json.load(open(mp)); m["result_sha256"] = sha
    f = open(mp, "w"); _json.dump(m, f); f.close()


# 36. r6 production manifest: 144 units + hardened verification columns + run manifest
def t_r6_manifest():
    import csv as _csv
    mf = list(_csv.DictReader(open(os.path.join(_SMOKE6, "unit_manifest.csv"))))
    cols = set(mf[0].keys())
    need = {"verification_status", "environment_status", "result_checksum_status",
            "attempt_checksum_status", "schema_status", "sims_completed"}
    rm = _json.load(open(os.path.join(_SMOKE6, "run_manifest.json")))
    ok = (len(mf) == 144 and need <= cols
          and rm["units_required"] == 144 and rm["simulations_required"] == 144000
          and rm["production_complete"] is False
          and "config_hash" in rm and "expected_environment" in rm)
    check("36_r6_manifest_hardened", ok, f"{len(mf)} units, production_complete={rm['production_complete']}")


# 37. strict acceptance injection cases (gradient missing/nonfinite/above-tol,
#     hessian, message, optimizer, singular, warning capture)
def t_r6_accepttest():
    r = _r6("accepttest")
    ok = r.returncode == 0 and r.stdout.count("[PASS]") == 9 and "[FAIL]" not in r.stdout
    check("37_strict_acceptance_injection_cases", ok, f"{r.stdout.count('[PASS]')}/9 PASS")


# 38. ENVIRONMENT_MISMATCH detection
def t_r6_env():
    tmp = tempfile.mkdtemp(); _copy_unit30(tmp)
    mp = os.path.join(tmp, "units", "unit_030_meta.json")
    m = _json.load(open(mp)); m["environment"] = "R version 9.9.9 FAKE"
    f = open(mp, "w"); _json.dump(m, f); f.close()
    r = _r6("verify", tmp, "30", "4")
    check("38_environment_mismatch_detected", r.returncode == 1
          and "ENVIRONMENT_MISMATCH" in r.stdout, r.stdout.strip())


# 39. CHECKSUM_MISMATCH detection
def t_r6_checksum():
    tmp = tempfile.mkdtemp(); _copy_unit30(tmp)
    p = os.path.join(tmp, "units", "unit_030.csv")
    f = open(p, "a"); f.write("#tamper\n"); f.close()
    r = _r6("verify", tmp, "30", "4")
    check("39_checksum_mismatch_detected", r.returncode == 1
          and "CHECKSUM_MISMATCH" in r.stdout, r.stdout.strip())


# 40. SCHEMA_MISMATCH detection (column dropped, checksum refreshed)
def t_r6_schema():
    tmp = tempfile.mkdtemp(); _copy_unit30(tmp)
    _tamper_result(tmp, None, drop_col="covered")
    r = _r6("verify", tmp, "30", "4")
    check("40_schema_mismatch_detected", r.returncode == 1
          and "SCHEMA_MISMATCH" in r.stdout, r.stdout.strip())


# 41. SIMULATION_INDEX_MISMATCH detection (duplicate sim, checksum refreshed)
def t_r6_simindex():
    tmp = tempfile.mkdtemp(); _copy_unit30(tmp)
    def dup(rows): rows[3]["sim"] = rows[2]["sim"]
    _tamper_result(tmp, dup)
    r = _r6("verify", tmp, "30", "4")
    check("41_simulation_index_mismatch_detected", r.returncode == 1
          and "SIMULATION_INDEX_MISMATCH" in r.stdout, r.stdout.strip())


# 42. UNIT_ID_MISMATCH detection (row unit id corrupted, checksum refreshed)
def t_r6_unitid():
    tmp = tempfile.mkdtemp(); _copy_unit30(tmp)
    def bad(rows): rows[1]["unit_id"] = "99"
    _tamper_result(tmp, bad)
    r = _r6("verify", tmp, "30", "4")
    check("42_unit_id_mismatch_detected", r.returncode == 1
          and "UNIT_ID_MISMATCH" in r.stdout, r.stdout.strip())


# 43. ATTEMPTS_MISSING detection
def t_r6_attempts_missing():
    tmp = tempfile.mkdtemp(); _copy_unit30(tmp)
    os.remove(os.path.join(tmp, "units", "unit_030_attempts_full.jsonl"))
    r = _r6("verify", tmp, "30", "4")
    check("43_attempts_missing_detected", r.returncode == 1
          and "ATTEMPTS_MISSING" in r.stdout, r.stdout.strip())


# 44. strict aggregate refuses smoke; partial aggregate explicitly non-production
def t_r6_strict_vs_partial():
    r = _r6("aggregate", _SMOKE6)
    strict_refused = r.returncode == 1 and "REFUSED" in r.stdout
    r2 = _r6("aggregate_partial", _SMOKE6, "4")
    rm = _json.load(open(os.path.join(_SMOKE6, "run_manifest.json")))
    partial_ok = (r2.returncode == 0 and rm["production_complete"] is False
                  and "no n recommendation" in rm["note"].lower()
                  and os.path.exists(os.path.join(_SMOKE6, "cell_summary_partial.csv")))
    check("44_strict_refuses_partial_flags", strict_refused and partial_ok,
          f"strict_exit={r.returncode}, partial_flag={rm['production_complete']}")


# 45. r6 deterministic rerun: results + lossless JSONL byte-identical
def t_r6_deterministic():
    import hashlib
    tmp = tempfile.mkdtemp()
    _r6("run", tmp, "4", "1", "30")
    def h(p): return hashlib.sha256(open(p, "rb").read()).hexdigest()
    b = os.path.join(_SMOKE6, "units"); r = os.path.join(tmp, "units")
    ok = (h(os.path.join(b, "unit_030.csv")) == h(os.path.join(r, "unit_030.csv"))
          and h(os.path.join(b, "unit_030_attempts_full.jsonl"))
              == h(os.path.join(r, "unit_030_attempts_full.jsonl")))
    check("45_r6_deterministic_rerun", ok, "results + JSONL byte-identical")


def main():
    for fn in (t_between, t_random_structure, t_balance, t_cb_deterministic,
               t_selective_pass, t_failed_manip, t_confound, t_criterion_only,
               t_sensitivity_only, t_mixed, t_exploratory, t_no_forbidden,
               t_synthetic_only, t_sdt_sanity, t_null, t_small_positive,
               t_item_both_sources, t_list_balance, t_item_freq_identical,
               t_seed_provenance, t_pid_alignment, t_item_random_decision,
               t_reproducible_scenario, t_config_analysis, t_config_task_mc,
               t_r_and_materials, t_manifest_144, t_hash_enforcement,
               t_incomplete_detection, t_convergence_capture, t_fallback_capture,
               t_deterministic_rerun, t_r6_manifest, t_r6_accepttest, t_r6_env,
               t_r6_checksum, t_r6_schema, t_r6_simindex, t_r6_unitid,
               t_r6_attempts_missing, t_r6_strict_vs_partial, t_r6_deterministic):
        fn()

    passed = sum(1 for _n, ok, _d in _results if ok)
    total = len(_results)
    print("=" * 72)
    print("PILOT_A_PYTHON_RECONSTRUCTION_v1 (revised) — test suite")
    print("=" * 72)
    for name, ok, detail in _results:
        tag = "PASS" if ok else "FAIL"
        line = f"[{tag}] {name}"
        if detail and not ok:
            line += f"   <<{detail}>>"
        elif detail:
            line += f"   ({detail})"
        print(line)
    print("-" * 72)
    print(f"{passed}/{total} passed")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
