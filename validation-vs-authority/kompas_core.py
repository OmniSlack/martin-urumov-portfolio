"""
kompas_core — reference implementation of the two gaps still open on the list:

    5. Fault-Isolation Workflow   -> ordered diagnostic check, not guesswork
    6. Mitigation != Closure      -> a problem status the sidecar/pipeline cannot skip

Design follows the same discipline as sidecar_validator_v2:
  - deterministic, named reasons
  - no gate is "absolute magic" — every threshold/order is a constructor argument
  - status transitions are one-way unless explicitly reopened, and never silently collapsed

STATUS: CANDIDATE. Not wired into kompas.py or sidecar_validator_v2 yet — that is a
separate, explicit step, not implied by writing this file.
"""
from dataclasses import dataclass, field
from enum import Enum


# ---------------------------------------------------------------------------
# 5. FAULT-ISOLATION WORKFLOW
# ---------------------------------------------------------------------------
# The order is a starting hypothesis, not a universal law (per the combined-
# defense-protocol note: "source -> input -> connection -> component -> core
# is a starting schema, not a universal law"). It is a constructor argument
# so a caller can override it for a system where the dependency order differs.

DEFAULT_ISOLATION_ORDER = ("source", "input", "connection", "component", "core")


@dataclass(frozen=True)
class IsolationResult:
    stage: str | None          # first stage that failed its check, or None if all passed
    checked: tuple             # stages actually checked, in order, up to and including `stage`
    reason: str | None = None


class FaultIsolator:
    """Runs named checks in a fixed order and stops at the FIRST failure.

    Why "first failure, not all failures": running every check after the
    first failure often reports symptoms of the first failure as if they
    were independent causes (e.g. a dead `source` check makes `input` and
    `connection` look broken too). Isolating stops that cascade.
    """

    def __init__(self, checks: dict, order: tuple = DEFAULT_ISOLATION_ORDER):
        missing = set(order) - set(checks)
        if missing:
            raise ValueError(f"no check registered for stage(s): {sorted(missing)}")
        self.checks = checks
        self.order = order

    def isolate(self, context: dict) -> IsolationResult:
        checked = []
        for stage in self.order:
            checked.append(stage)
            ok, reason = self.checks[stage](context)
            if not ok:
                return IsolationResult(stage=stage, checked=tuple(checked), reason=reason)
        return IsolationResult(stage=None, checked=tuple(checked), reason=None)


# ---------------------------------------------------------------------------
# 6. MITIGATION != CLOSURE
# ---------------------------------------------------------------------------
# Lifecycle: OPEN -> MITIGATED -> FIX_APPLIED -> CLOSURE_VERIFIED
# A symptom disappearing (MITIGATED) is not the same claim as the root cause
# being fixed (FIX_APPLIED), which is not the same claim as independent
# verification of that fix (CLOSURE_VERIFIED). Skipping a stage requires an
# explicit, named override — it never happens by default.

class IssueState(Enum):
    OPEN = "OPEN"
    MITIGATED = "MITIGATED"
    FIX_APPLIED = "FIX_APPLIED"
    CLOSURE_VERIFIED = "CLOSURE_VERIFIED"
    REOPENED = "REOPENED"


_ALLOWED_TRANSITIONS = {
    IssueState.OPEN: {IssueState.MITIGATED, IssueState.FIX_APPLIED},
    IssueState.MITIGATED: {IssueState.FIX_APPLIED, IssueState.REOPENED},
    IssueState.FIX_APPLIED: {IssueState.CLOSURE_VERIFIED, IssueState.REOPENED},
    IssueState.CLOSURE_VERIFIED: {IssueState.REOPENED},
    IssueState.REOPENED: {IssueState.MITIGATED, IssueState.FIX_APPLIED},
}


class IllegalTransition(Exception):
    pass


@dataclass
class Issue:
    issue_id: str
    state: IssueState = IssueState.OPEN
    history: list = field(default_factory=list)

    def transition(self, to: IssueState, *, evidence: str, verified_by: str | None = None):
        """Move to a new state. Raises IllegalTransition on a skipped/invalid move.

        `evidence` is mandatory and freeform (a log line, a test name, a link) —
        this class does not judge evidence quality, only that a transition
        cannot happen with an empty reason attached.

        Moving to CLOSURE_VERIFIED additionally requires `verified_by` to be
        set and different from whoever applied the fix — this is the code
        form of "generator and verifier are different passes" from Gate 8.
        """
        if not evidence:
            raise IllegalTransition("no evidence given for transition")
        if to not in _ALLOWED_TRANSITIONS.get(self.state, set()):
            raise IllegalTransition(f"{self.state.value} -> {to.value} is not an allowed transition")
        if to is IssueState.CLOSURE_VERIFIED and not verified_by:
            raise IllegalTransition("CLOSURE_VERIFIED requires verified_by (independent verifier)")
        self.history.append({"from": self.state.value, "to": to.value, "evidence": evidence, "verified_by": verified_by})
        self.state = to

    @property
    def is_closed(self) -> bool:
        return self.state is IssueState.CLOSURE_VERIFIED
