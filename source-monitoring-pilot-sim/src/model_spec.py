"""Confirmatory model SPECIFICATION (not fitted here).

CANDIDATE. This module EMITS the exact planned model formula and STATICALLY
VALIDATES the random-effects structure for the between-participant design. It
does NOT fit a GLMM. No custom optimizer is implemented. Descriptive synthetic
outputs elsewhere in this project are NOT inferential GLMM results.

Actual estimation is deferred to an approved environment (R lme4::glmer with a
probit link) — see analysis_R/fit_glmm.R — subject to methodological approval.
"""

GROUPING_FACTOR = "participant_id"  # must match the data column exactly

# Primary model per PILOT_A_EXECUTION_LOCK_v0.1 §10 (CANDIDATE lock): includes
# the by-item random intercept, since item source is counterbalanced.
CONFIRMATORY_FORMULA = ("response_external ~ condition * source_truth "
                        "+ (1 + source_truth | participant_id) + (1 | item_id)")

# Locked convergence hierarchy (no post hoc model search; any fallback must be
# reported and the interpretation weakened).
CONVERGENCE_HIERARCHY = [
    CONFIRMATORY_FORMULA,
    ("response_external ~ condition * source_truth "
     "+ (1 + source_truth || participant_id) + (1 | item_id)"),
    ("response_external ~ condition * source_truth "
     "+ (1 | participant_id) + (1 | item_id)"),
]
FALLBACK_FORMULA = CONVERGENCE_HIERARCHY[-1]

ITEM_RANDOM_EFFECT_DECISION = {
    "status": ("SPECIFIED_BY_EXECUTION_LOCK_v0.1 (lock itself remains CANDIDATE "
               "until Martin's explicit approval)"),
    "formula": CONFIRMATORY_FORMULA,
    "rationale": ("item source is counterbalanced across participants, so item "
                  "variability is separable from source_truth; the by-item random "
                  "intercept controls item heterogeneity."),
    "validation_note": ("synthetic validation: with item variance present the full "
                        "model converges non-singularly; on generators with zero "
                        "item variance the item term is singular by construction."),
}

# How the fixed-effect coefficients are INTENDED to map onto SDT quantities
# under a probit link (documentation for the future validated fit; not computed
# here). condition: control=0/decentering=1; source_truth: internal=0/external=1.
#   Intercept (b0)               : probit P(respond external | control, internal) = z(FA_control)
#   source_truth (b2)            : control-group d'  = b2
#   condition (b1)               : shifts the internal-trial probit for decentering
#   condition:source_truth (b3)  : Δd' (decentering - control) = b3   [discriminant control]
# Criterion mapping (documented): Δc = -(b1 + b3/2); under the clean hypothesis
# b3 ~ 0 so Δc ~ -b1. Primary estimand = criterion shift Δc (direction: c_dec > c_control).
COEFFICIENT_MAP = {
    "intercept": "z(FA) for control/internal (baseline criterion component)",
    "condition": "criterion-related intercept shift for decentering (primary; enters Δc)",
    "source_truth": "control-group sensitivity d'",
    "condition:source_truth": "Δd' (decentering - control): sensitivity discriminant control",
    "primary_estimand": "Δc = -(b_condition + b_condition:source_truth / 2); direction c_dec > c_control",
}

CONVERGENCE_CHECKS = [
    "singular-fit check on the random-effects covariance",
    "gradient / Hessian convergence diagnostics from the fitting library",
    "refit with an alternative optimizer to confirm stability",
    "if the maximal random structure fails to converge, drop to FALLBACK_FORMULA",
]


class RandomStructureError(ValueError):
    pass


def validate_random_structure(by_participant_terms):
    """Enforce the between-participant rule.

    by_participant_terms: list of terms in the by-participant random effect,
    e.g. ["1", "source_truth"].  'condition' is a between-participant factor and
    does NOT vary within participant, so it must NOT appear as a by-participant
    random slope. Raises RandomStructureError otherwise.
    """
    terms = [t.strip() for t in by_participant_terms]
    if "condition" in terms:
        raise RandomStructureError(
            "condition is between-participant and cannot have a by-participant "
            "random slope; use random intercept + random slope for source_truth only."
        )
    return True


# The locked, validated random structure for this design.
LOCKED_BY_PARTICIPANT_TERMS = ["1", "source_truth"]


def emit_specification():
    """Return the full specification as a plain dict (for reporting / JSON)."""
    validate_random_structure(LOCKED_BY_PARTICIPANT_TERMS)
    return {
        "design": "randomized between-participant",
        "grouping_factor": GROUPING_FACTOR,
        "confirmatory_formula": CONFIRMATORY_FORMULA,
        "convergence_hierarchy": CONVERGENCE_HIERARCHY,
        "fallback_formula": FALLBACK_FORMULA,
        "link": "probit",
        "by_participant_random_terms": LOCKED_BY_PARTICIPANT_TERMS,
        "item_random_effect_decision": ITEM_RANDOM_EFFECT_DECISION,
        "coefficient_map": COEFFICIENT_MAP,
        "convergence_checks": CONVERGENCE_CHECKS,
        "primary_endpoint": "criterion c (Δc = c_decentering - c_active_control)",
        "directional_prediction": "c_decentering > c_active_control",
        "discriminant_control": "condition x source_truth interaction (Δd')",
        "estimation_environment": ("R lme4::glmer (probit), implemented in "
                                   "analysis_R/fit_glmm.R — synthetic validation only; "
                                   "real-data use requires ethics + preregistration + "
                                   "Martin's authorization"),
        "status": ("SPECIFICATION per PILOT_A_EXECUTION_LOCK_v0.1 (CANDIDATE); "
                   "Python layer performs no inferential fitting"),
    }
