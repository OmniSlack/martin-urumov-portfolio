"""Descriptive analysis + machine-readable interpretation.

CANDIDATE. Produces DESCRIPTIVE per-participant SDT (d', c), group contrasts,
manipulation-check verdicts, and a final interpretation verdict that follows the
lock's interpretation matrix. These are synthetic-harness DESCRIPTIVES and
VERDICT LOGIC only — NOT inferential GLMM results. The confirmatory probit GLMM
is specified in model_spec.py and fitted elsewhere (R), not here.
"""

from . import config, sdt, manipulation_check as mc

# Final interpretation vocabulary (maps to the lock interpretation matrix).
INTERPRETATIONS = (
    "SUPPORTS_decentering_specific_criterion_effect",
    "NO_criterion_effect_decentering_induced_kill",
    "SENSITIVITY_effect_hypothesis_unsupported",
    "MIXED_criterion_and_sensitivity_needs_followup",
    "MANIPULATION_FAILED_uninterpretable_for_mechanism",
    "CONFOUNDED_criterion_present_mechanism_unsupported",
    "CONFOUNDED_no_clean_criterion_effect",
)


def participant_sdt(trial_rows):
    """Return {participant_id: (condition, dprime, c)} from test trials only."""
    agg = {}
    for r in trial_rows:
        if r["practice_trial"] == 1:
            continue
        pid = r["participant_id"]
        a = agg.setdefault(pid, {"condition": r["condition"],
                                 "hits": 0, "n_sig": 0, "fa": 0, "n_noise": 0})
        if r["source_truth"] == 1:      # signal = external
            a["n_sig"] += 1
            a["hits"] += r["response_external"]
        else:                            # noise = internal
            a["n_noise"] += 1
            a["fa"] += r["response_external"]
    out = {}
    for pid, a in agg.items():
        dprime, c = sdt.dprime_c(a["hits"], a["n_sig"], a["fa"], a["n_noise"])
        out[pid] = (a["condition"], dprime, c)
    return out


def _group_mean(values):
    return sum(values) / len(values) if values else float("nan")


def contrasts(trial_rows):
    """Descriptive Δc and Δd' (decentering - control) plus group means."""
    psdt = participant_sdt(trial_rows)
    d_c, d_dp, c_c, c_dp = [], [], [], []
    for cond, dprime, c in psdt.values():
        if cond == "decentering":
            d_dp.append(dprime); d_c.append(c)
        else:
            c_dp.append(dprime); c_c.append(c)
    dprime_ctrl, dprime_dec = _group_mean(c_dp), _group_mean(d_dp)
    c_ctrl, c_dec = _group_mean(c_c), _group_mean(d_c)
    return {
        "dprime_control": round(dprime_ctrl, 4),
        "dprime_decentering": round(dprime_dec, 4),
        "c_control": round(c_ctrl, 4),
        "c_decentering": round(c_dec, 4),
        "delta_dprime": round(dprime_dec - dprime_ctrl, 4),
        "delta_c": round(c_dec - c_ctrl, 4),
        "n_control": len(c_c),
        "n_decentering": len(d_c),
    }


def final_interpretation(delta_c, delta_dprime, mc_verdict, margins=None):
    """Follow the lock interpretation matrix. Synthetic verdict logic only."""
    m = margins or config.MARGINS
    c_shift = delta_c > m["c_decision_margin"]          # positive predicted direction
    d_shift = abs(delta_dprime) > m["d_decision_margin"]

    if mc_verdict == "failed_no_decentering_effect":
        return "MANIPULATION_FAILED_uninterpretable_for_mechanism"
    if mc_verdict.startswith("confounded_"):
        return ("CONFOUNDED_criterion_present_mechanism_unsupported" if c_shift
                else "CONFOUNDED_no_clean_criterion_effect")
    # selective_pass
    if c_shift and not d_shift:
        return "SUPPORTS_decentering_specific_criterion_effect"
    if c_shift and d_shift:
        return "MIXED_criterion_and_sensitivity_needs_followup"
    if d_shift and not c_shift:
        return "SENSITIVITY_effect_hypothesis_unsupported"
    return "NO_criterion_effect_decentering_induced_kill"


def analyze_scenario(scenario_name, trial_rows, mc_rows, margins=None):
    con = contrasts(trial_rows)
    means = mc.group_means([(cond, fields) for _pid, cond, fields in mc_rows])
    mc_verdict, mc_details = mc.manipulation_check_verdict(means, margins)
    interp = final_interpretation(con["delta_c"], con["delta_dprime"], mc_verdict, margins)
    return {
        "scenario": scenario_name,
        "contrasts": con,
        "manipulation_check_means": {c: {k: round(v, 4) for k, v in d.items()}
                                     for c, d in means.items()},
        "manipulation_check_verdict": mc_verdict,
        "manipulation_check_details": mc_details,
        "final_interpretation": interp,
        "note_on_status": ("DESCRIPTIVE synthetic outputs + verdict logic only; "
                           "NOT an inferential GLMM result."),
    }
