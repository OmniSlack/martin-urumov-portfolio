"""Selective manipulation-check battery and machine-readable verdict.

CANDIDATE. Implements the lock's rule:

  A criterion shift is interpretable as decentering-specific ONLY when the
  decentering condition differs selectively on MPoD-s while the matched
  dimensions show no meaningful difference.

IMPORTANT: "no meaningful difference" is decided against PLACEHOLDER equivalence
margins, NOT by ordinary non-significance. Non-significance is never treated as
evidence of equivalence. Real SESOI / equivalence margins require human
methodological approval before preregistration.
"""

import random
from . import config

# machine-readable verdict vocabulary
VERDICTS = (
    "selective_pass",
    "failed_no_decentering_effect",
    "confounded_relaxation",
    "confounded_distress",
    "confounded_effort",
    "confounded_expectancy",
    "confounded_engagement",
)

_MATCHED_TO_VERDICT = {
    "relaxation_state": "confounded_relaxation",
    "distress_state": "confounded_distress",
    "perceived_effort": "confounded_effort",
    "credibility_expectancy": "confounded_expectancy",
    "task_engagement": "confounded_engagement",
}


def generate_participant_mc(condition, scenario_cfg, rng):
    """Return a dict of the six manipulation-check fields for one participant."""
    offsets = scenario_cfg.get("mc_offsets", {}) if condition == "decentering" else {}
    fields = {}
    for dim in config.MC_DIMS:
        base = config.MC_BASE[dim] + offsets.get(dim, 0.0)
        fields[dim] = round(rng.gauss(base, config.MC_SD), 4)
    return fields


def group_means(mc_rows):
    """mc_rows: list of (condition, mc_dict). Returns {condition: {dim: mean}}."""
    sums, counts = {}, {}
    for cond, mc in mc_rows:
        sums.setdefault(cond, {d: 0.0 for d in config.MC_DIMS})
        counts[cond] = counts.get(cond, 0) + 1
        for d in config.MC_DIMS:
            sums[cond][d] += mc[d]
    return {cond: {d: sums[cond][d] / counts[cond] for d in config.MC_DIMS} for cond in sums}


def manipulation_check_verdict(means, margins=None):
    """means: {condition: {dim: mean}}. Returns (verdict, details).

    Placeholder-margin logic, NOT significance testing.
    """
    m = margins or config.MARGINS
    dec = means["decentering"]
    ctrl = means["active_control"]

    mpod_diff = dec["mpod_s_state_decentering"] - ctrl["mpod_s_state_decentering"]
    matched_diffs = {
        dim: dec[dim] - ctrl[dim] for dim in _MATCHED_TO_VERDICT
    }
    details = {
        "mpod_s_diff": round(mpod_diff, 4),
        "matched_diffs": {k: round(v, 4) for k, v in matched_diffs.items()},
        "margins_used": dict(m),
        "note": "Margins are PLACEHOLDERS; within-margin is NOT an equivalence claim.",
    }

    if mpod_diff < m["mpod_min_diff"]:
        return "failed_no_decentering_effect", details

    confounds = [dim for dim, d in matched_diffs.items() if abs(d) > m["matched_margin"]]
    if not confounds:
        return "selective_pass", details

    details["confounded_dimensions"] = confounds
    # deterministic priority order = config.MC_DIMS order
    for dim in config.MC_DIMS:
        if dim in confounds:
            return _MATCHED_TO_VERDICT[dim], details
    return _MATCHED_TO_VERDICT[confounds[0]], details
