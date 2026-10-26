"""
flag_hold_validator.py — payload gate with a flag that must survive evidence.

A new copy next to payload_policy_validator.py (V3), which is left unchanged.
It reuses V3 for the discrepancy score m and the thresholds, and changes only
what happens on a relative jump.

Why a new copy
--------------
V3 judges a jump against the baseline on both sides and locks at once:
  * a payload CLEANER than usual (m below the baseline) is locked — a false stop;
  * a payload above the baseline but below the hard threshold is locked on one
    observation, and an ablation (test_sidecar_v2_gaps.py, test_08) counted
    1,540 such stops on its grid against 2,727 genuine catches that the hard
    threshold alone already made.

The method (Martin Urumov): direction matters, and a flag is data, not a verdict.
  * A jump DOWN is acceptance. It executes.
  * A jump UP below the hard threshold raises a FLAG: the request is put on HOLD,
    not stopped. The flag is then tested against the next observations:
      - it SURVIVES if the jump is confirmed            -> EXECUTION_LOCK
      - it VANISHES if the next observations are normal -> released; reason
        recorded as "missing context"
  * A flag is not lowered under pressure — not by repeating the request and not
    by asking for it to be cleared — only by evidence (normal observations).
  * While a flag is open the baseline is frozen, so a sustained jump cannot
    normalise itself into the baseline and pass.
  * At or above the hard threshold m_lock: EXECUTION_LOCK, always, regardless
    of the baseline. Unchanged from V3.

Decisions: AUTO_EXECUTE · HOLD · EXECUTION_LOCK.
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

from payload_policy_validator import PayloadPolicyValidator

AUTO_EXECUTE = "AUTO_EXECUTE"
HOLD = "HOLD"
EXECUTION_LOCK = "EXECUTION_LOCK"


class FlagRefused(Exception):
    """Raised when a flag is asked to be cleared without evidence."""


class FlagHoldValidator:
    def __init__(
        self,
        base: Optional[PayloadPolicyValidator] = None,
        confirmations_to_lock: int = 2,
        normals_to_clear: int = 3,
        initial_baseline: float = 0.0,
    ):
        if confirmations_to_lock < 1 or normals_to_clear < 1:
            raise ValueError("confirmations_to_lock and normals_to_clear must be >= 1")
        self.base = base or PayloadPolicyValidator()
        self.confirmations_to_lock = confirmations_to_lock
        self.normals_to_clear = normals_to_clear
        self.baseline = float(initial_baseline)
        self.flag: Optional[Dict[str, Any]] = None   # open or confirmed flag
        self.log: List[Dict[str, Any]] = []          # append-only record of every decision
        self._n = 0

    # ------------------------------------------------------------ thresholds
    @property
    def m_lock(self) -> float:
        return self.base.m_lock

    @property
    def rel_threshold(self) -> float:
        return self.base.rel_threshold()

    # ------------------------------------------------------------ evaluation
    def evaluate_payload(self, payload: Any, schema: Dict[str, Any]) -> Dict[str, Any]:
        m, breakdown = self.base.compute_policy_discrepancy(payload, schema)
        d = self.evaluate(m)
        d["breakdown"] = breakdown
        return d

    def evaluate(self, m: float) -> Dict[str, Any]:
        self._n += 1
        m = float(m)

        # 1. Hard threshold: always locks, baseline-independent.
        if m >= self.m_lock:
            if self.flag is not None and self.flag["state"] == "OPEN":
                self._confirm("hard threshold reached while the flag was open")
            return self._record(m, EXECUTION_LOCK, f"ABS m={m:.4f} >= m_lock={self.m_lock}")

        # 2. A confirmed flag stays locked until cleared with evidence by a human.
        if self.flag is not None and self.flag["state"] == "CONFIRMED":
            return self._record(m, EXECUTION_LOCK, "FLAG_CONFIRMED — awaiting human review with evidence")

        thr = self.rel_threshold

        # 3. An open flag is tested against this observation (baseline frozen).
        if self.flag is not None:
            r = m - self.flag["baseline_at_open"]
            if r > thr:
                self.flag["confirmations"] += 1
                self.flag["normals"] = 0
                if self.flag["confirmations"] >= self.confirmations_to_lock:
                    self._confirm(f"jump repeated {self.flag['confirmations']} more time(s)")
                    return self._record(m, EXECUTION_LOCK, "FLAG_SURVIVED — the jump is real")
                return self._record(m, HOLD, f"FLAG_OPEN — confirmation {self.flag['confirmations']}"
                                             f"/{self.confirmations_to_lock}")
            self.flag["normals"] += 1
            if self.flag["normals"] >= self.normals_to_clear:
                cleared = self.flag
                self.flag = None
                cleared["state"] = "VANISHED"
                return self._record(m, AUTO_EXECUTE,
                                    "FLAG_VANISHED — missing context; the flagged request "
                                    f"(#{cleared['opened_at']}) may be resubmitted")
            return self._record(m, HOLD, f"FLAG_OPEN — normal {self.flag['normals']}"
                                         f"/{self.normals_to_clear}")

        # 4. No flag: direction decides.
        r = m - self.baseline
        if r > thr:
            self.flag = {"state": "OPEN", "opened_at": self._n, "m_at_open": m,
                         "baseline_at_open": self.baseline, "confirmations": 0, "normals": 0}
            return self._record(m, HOLD, f"FLAG_OPENED — jump up r={r:.4f} > {thr:.4f}")

        reason = "DOWNWARD_ACCEPTED" if r < -thr else "NONE"
        self.baseline = self.base.alpha * m + (1.0 - self.base.alpha) * self.baseline
        return self._record(m, AUTO_EXECUTE, reason)

    # ------------------------------------------------------------ the flag
    def request_clear(self, by: str, evidence: Optional[str] = None) -> None:
        """A flag is not lowered under pressure. An OPEN flag clears only through
        normal observations. A CONFIRMED flag clears only with a named human and
        a written piece of evidence; both are recorded."""
        if self.flag is None:
            return
        if self.flag["state"] == "OPEN":
            raise FlagRefused("an open flag clears only through normal observations, "
                              "not on request")
        if not by or not evidence or not str(evidence).strip():
            raise FlagRefused("a confirmed flag clears only with a named reviewer and evidence")
        self.log.append({"n": self._n, "event": "FLAG_CLEARED_BY_HUMAN", "by": by,
                         "evidence": evidence, "flag": dict(self.flag), "timestamp": time.time()})
        self.flag = None

    def _confirm(self, why: str) -> None:
        self.flag["state"] = "CONFIRMED"
        self.flag["confirmed_because"] = why

    def _record(self, m: float, decision: str, reason: str) -> Dict[str, Any]:
        rec = {
            "n": self._n,
            "m": round(m, 4),
            "baseline": round(self.baseline, 4),
            "rel_threshold": round(self.rel_threshold, 4),
            "m_lock": self.m_lock,
            "decision": decision,
            "reason": reason,
            "flag_state": None if self.flag is None else self.flag["state"],
            "timestamp": time.time(),
        }
        self.log.append(rec)
        return dict(rec)
