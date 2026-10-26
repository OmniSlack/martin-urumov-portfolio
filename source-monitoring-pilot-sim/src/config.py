"""PILOT_A_PYTHON_RECONSTRUCTION_v1 — configuration.

CANDIDATE · NOT ACTIVE · NOT CANON.

Reconstruction from documentation (PILOT_A_CORE_LOCK_v0.1 +
PILOT_A__INDEPENDENT_METHODOLOGICAL_REVIEW_v1 + CODEX_TASK__PILOT_A_REVISION_v1).
The original PowerShell prototype source was UNAVAILABLE; this is a fresh Python
reconstruction, not a reproduction of that code.

All numeric values below are SYNTHETIC GENERATOR SETTINGS and DECISION
THRESHOLDS for the synthetic harness only. They are NOT empirical effect
estimates and NOT SESOI / equivalence margins. Human methodological approval is
required to set real SESOI and equivalence margins before preregistration.
"""

# ---------------------------------------------------------------------------
# Task parameters (source-monitoring with encoding phase)
# ---------------------------------------------------------------------------
N_PER_GROUP = 60            # participants per condition (between-participant)
N_TEST_TRIALS = 100         # test trials per participant (~50/50 source classes)
N_PRACTICE_TRIALS = 10      # practice trials, separate item pool, feedback only here
MASTER_SEED = 20260720      # locked master seed for reproducibility

CONDITIONS = ("active_control", "decentering")  # control is the reference level

# Coding (documented; used by the model specification, not fitted here)
CODING = {
    "condition": {"active_control": 0, "decentering": 1},   # treatment coding, control = reference
    "source_truth": {"imagined_internal": 0, "perceived_external": 1},
    "response_external": {"internal": 0, "external": 1},
}

# ---------------------------------------------------------------------------
# Latent SDT population parameters (equal-variance SDT)
#   hit  = Phi(dprime/2 - c)      [P(respond external | truth external)]
#   fa   = Phi(-dprime/2 - c)     [P(respond external | truth internal)]
# Positive c  => conservative about responding "external".
# ---------------------------------------------------------------------------
BASE_DPRIME = 1.0           # control-group mean source-discrimination
BASE_C = 0.0                # control-group mean criterion
SD_DPRIME = 0.25            # between-participant SD (random intercept analogue)
SD_C = 0.20

# ---------------------------------------------------------------------------
# Decision thresholds for the SYNTHETIC machine-readable verdict ONLY.
# PLACEHOLDERS — not SESOI, not equivalence margins, not inferential.
# ---------------------------------------------------------------------------
MARGINS = {
    "mpod_min_diff": 0.50,      # decentering must exceed control on MPoD-s by >= this to count as "induced"
    "matched_margin": 0.50,     # a matched dimension counts as "no meaningful difference" only if |diff| < this
    "c_decision_margin": 0.10,  # |Δc| beyond this (and positive) counts as a criterion shift
    "d_decision_margin": 0.15,  # |Δd'| beyond this counts as a sensitivity shift
}

# ---------------------------------------------------------------------------
# Manipulation-check dimensions (participant-level).
# mpod_s is the target; the other five are matched (should NOT differ if clean).
# ---------------------------------------------------------------------------
MC_DIMS = (
    "mpod_s_state_decentering",
    "relaxation_state",
    "distress_state",
    "perceived_effort",
    "credibility_expectancy",
    "task_engagement",
)
MC_BASE = {  # control-group means on each dimension (arbitrary synthetic scale ~0..10)
    "mpod_s_state_decentering": 4.0,
    "relaxation_state": 5.0,
    "distress_state": 3.0,
    "perceived_effort": 5.0,
    "credibility_expectancy": 6.0,
    "task_engagement": 6.0,
}
MC_SD = 0.5  # between-participant SD on each dimension (synthetic; keeps group means separable)

# ---------------------------------------------------------------------------
# Five required scenarios.
# Each entry gives the DECENTERING-group offsets relative to control.
#   d_dprime : added to latent d' for the decentering group
#   d_c      : added to latent criterion c for the decentering group
#   mc_offsets: additive shifts on manipulation-check dims for decentering group
# ---------------------------------------------------------------------------
SCENARIOS = {
    # No endpoint change; manipulation still induced decentering (selective).
    # -> "decentering induced but no criterion effect" (falsification / kill row).
    "null": {
        "d_dprime": 0.0,
        "d_c": 0.0,
        "mc_offsets": {"mpod_s_state_decentering": 1.5},
        "note": "Induced decentering, no criterion and no sensitivity change.",
    },
    # Small predicted criterion shift, clean selective manipulation.
    # -> SUPPORTS decentering-specific criterion effect.
    "small_positive": {
        "d_dprime": 0.0,
        "d_c": 0.25,
        "mc_offsets": {"mpod_s_state_decentering": 1.5},
        "note": "Small predicted Δc>0, d' unchanged, clean check.",
    },
    # Larger criterion-only shift, clean selective manipulation.
    # -> SUPPORTS (criterion/bias effect).
    "criterion_only": {
        "d_dprime": 0.0,
        "d_c": 0.45,
        "mc_offsets": {"mpod_s_state_decentering": 1.5},
        "note": "Clear criterion shift, d' unchanged, clean check.",
    },
    # Sensitivity-only shift; criterion unchanged.
    # -> d' shift without Δc: sensitivity effect, hypothesis unsupported.
    "sensitivity_only": {
        "d_dprime": 0.50,
        "d_c": 0.0,
        "mc_offsets": {"mpod_s_state_decentering": 1.5},
        "note": "d' shift without Δc; wrong mechanism for the hypothesis.",
    },
    # Apparent Δc in predicted direction, MPoD-s difference present,
    # BUT credibility/expectancy also differs beyond margin (confound).
    # -> MUST trigger the failure rule: mechanism unsupported.
    "confounded_demand": {
        "d_dprime": 0.0,
        "d_c": 0.30,
        "mc_offsets": {
            "mpod_s_state_decentering": 1.5,
            "credibility_expectancy": 1.2,   # confound beyond matched_margin
        },
        "note": "Δc present but manipulation confounded by expectancy; failure rule must fire.",
    },
}

SCENARIO_ORDER = ("null", "small_positive", "criterion_only", "sensitivity_only", "confounded_demand")
