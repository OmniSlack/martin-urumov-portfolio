"""
sidecar_validator_v3 — v2 with the authority separation defect closed.

WHAT CHANGED FROM v2, AND WHY
=============================
v2's mathematics were sound (symmetric threshold, baseline-independent hard
rules, psi correctly demoted to telemetry). The defect was architectural:

    v2 returned AUTO_EXECUTE and exposed Decision.allowed

A validator that returns "execute" has collapsed two orthogonal axes:

    VALIDATION axis  — "I found no rule violation"      (mathematics/rules)
    AUTHORITY axis   — "you are permitted to act"       (human permit)

Mathematics can establish the first. It can never establish the second.
`VALIDATION_PASS != HUMAN_AUTHORITY`.

v3 therefore:
  1. Removes AUTO_EXECUTE entirely from the sidecar's vocabulary.
  2. Replaces Decision.allowed with Decision.passed (validation-only meaning).
  3. Makes enabled=False return VALIDATION_HOLD — a disabled check is an
     UNKNOWN result, never a pass.
  4. Blocks non-finite m (NaN/inf). `abs(nan) >= t` is False in IEEE-754, so
     v2 let NaN through as "no violation".
  5. Validates constructor config; a NaN/inf/negative threshold is refused at
     construction, not silently accepted.
  6. Checks required_fields even when the payload is not a mapping — an
     unverifiable payload is a violation, not a skip.
  7. Fixes keyword matching in both directions: word boundaries kill the
     "dropdown" -> "drop" false positive; a separator-stripped pass catches
     "d e l e t e" / "d-e-l-e-t-e".
  8. Moves the go/no-go decision into a separate ExecutionControl that
     requires BOTH a VALIDATION_PASS and an exact, unexpired HumanPermit
     matching target + action + scope.

OPERATOR CONTROL is unchanged and intentional: thresholds are constructor
arguments and the owner can switch the sidecar off. But switching it off now
yields HOLD, not PASS — turning off a smoke detector does not prove there is
no fire.

STATUS: CANDIDATE. Not wired to any adapter. Nothing here executes anything.
"""
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
import math
import re
import unicodedata

# -- sidecar verdicts. Deliberately NO "execute"-shaped value exists here. ----
VALIDATION_PASS = "VALIDATION_PASS"   # no rule violation found
EXECUTION_LOCK = "EXECUTION_LOCK"     # violation found -> blocked
VALIDATION_HOLD = "VALIDATION_HOLD"   # result unknown -> blocked

DEFAULT_HARD_THRESHOLD = 0.35
DEFAULT_RISKY_KEYWORDS = ("delete", "drop", "truncate", "shutdown")

# characters an attacker can interleave to break up a keyword.
# Used BETWEEN letters, never to pre-strip the text (see _keyword_violations).
_SEP_CLASS = r"[\s\-_.*/\\|+~`'\"()\[\]{}<>:;,]*"


@dataclass(frozen=True)
class Decision:
    """A validation result. NOT a permission.

    There is intentionally no `.allowed`, no `.execute`, no truthiness that a
    downstream caller could mistake for authority. The strongest thing this
    object can say is `passed` == "I found no violation".
    """
    decision: str
    reasons: tuple = ()
    anomaly_score: float = 1.0   # advisory telemetry; never a gate
    r_effective: float = 0.0

    @property
    def passed(self) -> bool:
        return self.decision == VALIDATION_PASS


class SidecarValidatorV3:
    def __init__(self, enabled=True, hard_threshold=DEFAULT_HARD_THRESHOLD,
                 risky_keywords=DEFAULT_RISKY_KEYWORDS, required_fields=()):
        # (5) config is validated at construction, not trusted.
        if not isinstance(hard_threshold, (int, float)) or isinstance(hard_threshold, bool):
            raise ValueError("hard_threshold must be a real number")
        if not math.isfinite(hard_threshold):
            raise ValueError("hard_threshold must be finite")
        if hard_threshold <= 0:
            raise ValueError("hard_threshold must be > 0")
        if isinstance(risky_keywords, str):
            raise ValueError("risky_keywords must be a sequence of strings, not a single string")

        self.enabled = bool(enabled)
        self.hard_threshold = float(hard_threshold)
        self.risky_keywords = tuple(k.lower() for k in risky_keywords)
        self.required_fields = tuple(required_fields)

    # -- 1. hard rules -----------------------------------------------------
    def violations(self, m=0.0, payload=None):
        reasons = []

        # (4) non-finite input is a violation, not a free pass.
        if not isinstance(m, (int, float)) or isinstance(m, bool):
            reasons.append("magnitude_not_a_number")
        elif not math.isfinite(m):
            reasons.append(f"magnitude_not_finite:{m}")
        elif abs(m) >= self.hard_threshold:
            reasons.append(f"magnitude_above_threshold:{abs(m):.4f}")

        reasons.extend(self._keyword_violations(payload))
        reasons.extend(self._required_field_violations(payload))
        return reasons

    def _keyword_violations(self, payload):
        """One pattern handles both failure directions.

        Separators are permitted BETWEEN the keyword's letters, so "d e l e t e"
        matches; boundaries are still required at both ends, so "dropdown" does
        NOT match "drop" (the char after "drop" is a letter).

        A naive strip-then-substring approach fails here: "dropdown menu"
        collapses to "dropdownmenu", which contains "drop". Caught by
        test_dropdown_is_not_a_false_positive.
        """
        if payload is None or not self.risky_keywords:
            return []
        raw = unicodedata.normalize("NFKC", str(payload)).lower()
        out = []
        for kw in self.risky_keywords:
            spaced = _SEP_CLASS.join(re.escape(ch) for ch in kw)
            if re.search(rf"(?<![a-z0-9]){spaced}(?![a-z0-9])", raw):
                out.append(f"risky_keyword:{kw}")
        return out

    def _required_field_violations(self, payload):
        if not self.required_fields:
            return []
        # (6) if fields are required, an unverifiable payload is a violation.
        if not hasattr(payload, "__contains__") or isinstance(payload, (str, bytes)):
            return ["required_fields_unverifiable:payload_not_a_mapping"]
        return [f"missing_field:{n}" for n in self.required_fields if n not in payload]

    # -- 2. telemetry: computed, reported, never consulted -----------------
    @staticmethod
    def r_effective(m, t_pred=0.0):
        try:
            r = max(abs(m), abs(m - t_pred))
        except TypeError:
            return float("nan")
        return r

    def anomaly_score(self, m, t_pred=0.0):
        r = self.r_effective(m, t_pred)
        if not isinstance(r, float) or not math.isfinite(r):
            return float("nan")
        return math.exp(-(r ** 2) / 2)

    # -- 3. validation only. No authority is produced here. ----------------
    def validate(self, m=0.0, t_pred=0.0, payload=None):
        r_eff = self.r_effective(m, t_pred)
        score = self.anomaly_score(m, t_pred)

        # (3) a disabled check is UNKNOWN, never a pass.
        if not self.enabled:
            return Decision(VALIDATION_HOLD, ("sidecar_disabled",), score, r_eff)

        reasons = self.violations(m=m, payload=payload)
        verdict = EXECUTION_LOCK if reasons else VALIDATION_PASS
        return Decision(verdict, tuple(reasons), score, r_eff)


# ---------------------------------------------------------------------------
# AUTHORITY AXIS — entirely separate from the validation axis above.
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class HumanPermit:
    """An explicit, bounded human permission. (6 in the fix list.)

    A bare boolean is not a permit: `authorized="false"` and `authorized=1`
    were both truthy in v2. A permit must name what it permits.
    """
    target: str
    action: str
    scope: str
    granted_by: str
    expires_at: datetime

    def is_valid_for(self, *, target, action, scope, now=None):
        now = now or datetime.now(timezone.utc)
        if self.expires_at.tzinfo is None:
            raise ValueError("permit expires_at must be timezone-aware")
        if now >= self.expires_at:
            return False, "permit_expired"
        if self.target != target:
            return False, f"permit_target_mismatch:{self.target}!={target}"
        if self.action != action:
            return False, f"permit_action_mismatch:{self.action}!={action}"
        if self.scope != scope:
            return False, f"permit_scope_mismatch:{self.scope}!={scope}"
        if not self.granted_by:
            return False, "permit_has_no_grantor"
        return True, None


@dataclass(frozen=True)
class ExecutionDecision:
    decision: str                  # EXECUTION_LOCK or "RELEASE_TO_ADAPTER"
    reasons: tuple = ()
    validation: Decision = None

    @property
    def released(self) -> bool:
        return self.decision == RELEASE_TO_ADAPTER


RELEASE_TO_ADAPTER = "RELEASE_TO_ADAPTER"


class ExecutionControl:
    """The ONLY component that may release work to an adapter.

    Requires both axes to be satisfied simultaneously:
        VALIDATION_PASS  AND  an exact, unexpired, matching HumanPermit
    Anything else -> EXECUTION_LOCK. There is no default-allow path.
    """

    def __init__(self, validator: SidecarValidatorV3):
        self.validator = validator

    def request(self, *, target, action, scope, m=0.0, t_pred=0.0,
                payload=None, permit=None, now=None):
        reasons = []

        validation = self.validator.validate(m=m, t_pred=t_pred, payload=payload)
        if not validation.passed:
            reasons.append(f"validation:{validation.decision}")
            reasons.extend(validation.reasons)

        # permit must be the real type; no truthy stand-ins accepted
        if not isinstance(permit, HumanPermit):
            reasons.append("no_valid_human_permit")
        else:
            ok, why = permit.is_valid_for(target=target, action=action,
                                          scope=scope, now=now)
            if not ok:
                reasons.append(why)

        verdict = EXECUTION_LOCK if reasons else RELEASE_TO_ADAPTER
        return ExecutionDecision(verdict, tuple(reasons), validation)
