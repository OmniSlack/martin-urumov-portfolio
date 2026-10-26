"""
sidecar_validator_v2 — reference implementation.

Design follows three separate questions, never collapsed into one score:

    1. Does the input break a hard rule?   -> deterministic, named reasons, BLOCKS
    2. How unusual is it?                  -> advisory score, NEVER blocks alone
    3. Is the action authorised?           -> separate axis, BLOCKS

Why psi is not a gate here: psi = exp(-r^2/2) is strictly decreasing in |r|,
so any threshold on psi is exactly equivalent to some threshold on |r|. As a
gate it adds no discriminative power over `abs(m) >= threshold`, while adding
false stops whenever the baseline is stale. It is kept as telemetry only.

Why the baseline never gates: an adaptive baseline that tracks m lets a
persistent violation normalise itself (r -> 0) and pass. Hard rules therefore
read m directly and ignore t_pred entirely.

OPERATOR CONTROL: this is not an "absolute" lock. `enabled=False` disables it,
and every threshold is a constructor argument. An operator who owns the system
can always override, inspect, or switch it off. That is intentional.
"""
from dataclasses import dataclass, field

DEFAULT_HARD_THRESHOLD = 0.35
DEFAULT_RISKY_KEYWORDS = ("delete", "drop", "truncate", "shutdown")

AUTO_EXECUTE = "AUTO_EXECUTE"
EXECUTION_LOCK = "EXECUTION_LOCK"


@dataclass(frozen=True)
class Decision:
    decision: str
    reasons: tuple = ()
    anomaly_score: float = 1.0   # advisory telemetry; not a gate
    r_effective: float = 0.0

    @property
    def allowed(self) -> bool:
        return self.decision == AUTO_EXECUTE


class SidecarValidatorV2:
    def __init__(self, enabled=True, hard_threshold=DEFAULT_HARD_THRESHOLD,
                 risky_keywords=DEFAULT_RISKY_KEYWORDS, required_fields=()):
        self.enabled = enabled
        self.hard_threshold = hard_threshold
        self.risky_keywords = tuple(k.lower() for k in risky_keywords)
        self.required_fields = tuple(required_fields)

    # -- 1. hard rules: deterministic, baseline-independent, always block ----
    def violations(self, m=0.0, payload=None):
        reasons = []

        # Symmetric. `m >= threshold` would miss every negative violation.
        if abs(m) >= self.hard_threshold:
            reasons.append(f"magnitude_above_threshold:{abs(m):.4f}")

        if payload is not None:
            haystack = str(payload).lower()          # case-insensitive
            for kw in self.risky_keywords:
                if kw in haystack:
                    reasons.append(f"risky_keyword:{kw}")
            if isinstance(payload, dict):
                for name in self.required_fields:
                    if name not in payload:
                        reasons.append(f"missing_field:{name}")
        return reasons

    # -- 2. anomaly score: advisory only, never sufficient grounds ----------
    @staticmethod
    def r_effective(m, t_pred=0.0):
        return max(abs(m), abs(m - t_pred))

    def anomaly_score(self, m, t_pred=0.0):
        """Reported for observability. Deliberately NOT a blocking condition."""
        import math
        return math.exp(-(self.r_effective(m, t_pred) ** 2) / 2)

    # -- 3. decision -------------------------------------------------------
    def evaluate_loop(self, m=0.0, t_pred=0.0, payload=None, authorized=True):
        r_eff = self.r_effective(m, t_pred)
        score = self.anomaly_score(m, t_pred)

        if not self.enabled:
            return Decision(AUTO_EXECUTE, ("sidecar_disabled",), score, r_eff)

        reasons = self.violations(m=m, payload=payload)
        if not authorized:
            reasons.append("authorization_missing")

        decision = EXECUTION_LOCK if reasons else AUTO_EXECUTE
        return Decision(decision, tuple(reasons), score, r_eff)
