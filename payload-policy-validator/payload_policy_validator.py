"""
PayloadPolicyValidator — separated scales and a comparable metric.

Formerly SidecarValidatorV3 (package SIDECAR_VALIDATOR_V3, 2026-09-16).
Renamed by function; the logic is unchanged.

Keeps the anchor of V2 (an absolute deviation cannot be hidden by an adaptive
baseline) and fixes the four things that made the V2 gate differ from its own
description:

  F1. One sigma served two incompatible quantities.
      V3: the relative residual (surprise) is sigma-scaled; the absolute residual
      has a threshold directly in units of m. Two scales, two thresholds.

  F2. The hard guard never changed a decision — it only relabelled a lock.
      V3: the threshold is reachable by construction and the configuration is
      validated; an inconsistent configuration raises an error instead of being
      dead code.

  F3. m depended on the verbosity of the schema (division by
      len(required_fields)+2), so a schema with 10+ required fields let a
      missing field through.
      V3: fixed denominator → m is comparable across schemas and sigma carries over.

  F4. Risk keywords were matched as substrings of json.dumps → "confirm", "alarm",
      "format" triggered the keyword "rm"; keys and values were mixed together.
      V3: word-boundary matching, keys and values reported separately,
      recursive through nested structures.

  Additionally: delta_t now actually reaches its declared ceiling inside the
  executable zone.

Status: CANDIDATE. The thresholds below are DEFAULTS, not measured values.
sigma and m_lock must come from a run over benign traffic — see calibrate().
"""

import json
import math
import re
import time
from typing import Any, Dict, List, Optional, Tuple

# psi at which the gate closes (relative component)
PSI_EXEC_MIN = 0.85
# Coefficient: psi < PSI_EXEC_MIN  <=>  r > gate * sigma * K_PSI
K_PSI = math.sqrt(-2.0 * math.log(PSI_EXEC_MIN))  # ≈ 0.5701

# Fixed denominator for m. Does NOT depend on the schema — this is fix F3.
# Chosen so that one missing required field gives m = 0.25.
M_DENOM = 4.0

WEIGHT_MISSING_FIELD = 1.0
WEIGHT_EXTRA_FIELDS_CAP = 1.0
WEIGHT_EXTRA_PER_FIELD = 0.5
WEIGHT_RISK_KEYWORD = 1.5


class ConfigError(ValueError):
    """Inconsistent configuration — raised instead of producing a dead threshold."""


class PayloadPolicyValidator:
    def __init__(
        self,
        alpha: float = 0.05,
        sigma: float = 0.05,
        m_lock: float = 0.35,
        gate: float = 3.0,
        du_min: float = 0.05,
        du_max: float = 1.8,
    ):
        """
        sigma  — spread of the RELATIVE residual, measured from benign traffic.
        m_lock — absolute threshold on m. A separate scale, not a sigma multiple (F1).
        gate   — multiplier for the relative component only.
        """
        if not (0.0 < alpha < 1.0):
            raise ConfigError(f"alpha must be in (0,1), got {alpha}")
        if sigma <= 0.0 or gate <= 0.0:
            raise ConfigError("sigma and gate must be > 0 (otherwise psi is identically 0)")
        if not (0.0 < m_lock <= 1.0):
            raise ConfigError(f"m_lock must be in (0,1], got {m_lock}")
        if du_max <= du_min:
            raise ConfigError("du_max must be > du_min")

        self.alpha = alpha
        self.sigma = sigma
        self.m_lock = m_lock
        self.gate = gate
        self.du_min = du_min
        self.du_max = du_max
        self.t_pred_ema = 0.0
        self._keyword_cache: Dict[str, re.Pattern] = {}

        self._validate_thresholds()

    # ---------------------------------------------------------------- config

    def rel_threshold(self) -> float:
        """Value of |r_rel| at which the relative component closes the gate."""
        return self.gate * self.sigma * K_PSI

    def _validate_thresholds(self) -> None:
        """
        Fix F2: every threshold must be able to bind.

        Important difference from V2: there, psi was computed over max(|m|, |r_rel|),
        so the psi test SWALLOWED the absolute one and the guard was dead. Here the
        two components look at different quantities, so the absolute threshold is
        live by construction — it is the only thing that catches a baseline that
        has adapted. Only the relative one can go dead: |r_rel| <= 1, because
        m, t_pred ∈ [0,1].
        """
        rel = self.rel_threshold()
        if rel >= 1.0:
            raise ConfigError(
                f"Dead relative threshold: gate*sigma*{K_PSI:.4f} = {rel:.4f} >= 1.0, "
                f"but |r_rel| never exceeds 1. The surprise component can never fire. "
                f"Reduce gate*sigma below {1.0 / K_PSI:.4f}."
            )

    def config_report(self) -> Dict[str, Any]:
        """Transparency: which threshold does what, and in which zone."""
        rel = self.rel_threshold()
        return {
            "rel_threshold_on_r_rel": round(rel, 4),
            "abs_threshold_on_m": self.m_lock,
            "binding_first_for_m": "relative" if rel < self.m_lock else "absolute",
            "delta_t_range_sec": (self.du_min, self.du_max),
            "sigma_is_measured": False,  # set to True only after calibrate()
        }

    # ------------------------------------------------------------- baseline

    def update_baseline(self, m_observed: float) -> float:
        self.t_pred_ema = self.alpha * m_observed + (1.0 - self.alpha) * self.t_pred_ema
        return self.t_pred_ema

    # ------------------------------------------------------------ metric  m

    def _kw_pattern(self, kw: str) -> re.Pattern:
        if kw not in self._keyword_cache:
            # Fix F4: word boundary, not substring.
            self._keyword_cache[kw] = re.compile(
                r"(?<![0-9A-Za-z_])" + re.escape(kw) + r"(?![0-9A-Za-z_])",
                re.IGNORECASE,
            )
        return self._keyword_cache[kw]

    @staticmethod
    def _walk(node: Any, keys: List[str], values: List[str]) -> None:
        """Recursively collects keys and values separately (fix F4)."""
        if isinstance(node, dict):
            for k, v in node.items():
                keys.append(str(k))
                PayloadPolicyValidator._walk(v, keys, values)
        elif isinstance(node, (list, tuple)):
            for v in node:
                PayloadPolicyValidator._walk(v, keys, values)
        elif node is not None:
            values.append(str(node))

    def compute_policy_discrepancy(
        self, payload: Dict[str, Any], schema_rules: Dict[str, Any]
    ) -> Tuple[float, Dict[str, Any]]:
        """
        Returns (m, breakdown). m ∈ [0,1] and is COMPARABLE across schemas (fix F3):
        the denominator is a constant, not the length of the schema.
        """
        required = schema_rules.get("required_fields", [])
        allowed = schema_rules.get("allowed_fields", [])
        keywords = schema_rules.get("risk_keywords", [])

        missing = [f for f in required if f not in payload]
        score_missing = WEIGHT_MISSING_FIELD * len(missing)

        extra: List[str] = []
        if allowed:
            extra = sorted(set(payload.keys()) - set(allowed))
        score_extra = min(WEIGHT_EXTRA_FIELDS_CAP, WEIGHT_EXTRA_PER_FIELD * len(extra))

        keys: List[str] = []
        values: List[str] = []
        self._walk(payload, keys, values)
        hits_keys, hits_values = [], []
        for kw in keywords:
            pat = self._kw_pattern(kw)
            if any(pat.search(k) for k in keys):
                hits_keys.append(kw)
            if any(pat.search(v) for v in values):
                hits_values.append(kw)
        score_kw = WEIGHT_RISK_KEYWORD * (len(hits_keys) + len(hits_values))

        raw = score_missing + score_extra + score_kw
        m = min(1.0, raw / M_DENOM)

        return m, {
            "missing_fields": missing,
            "extra_fields": extra,
            "risk_keywords_in_keys": hits_keys,
            "risk_keywords_in_values": hits_values,
            "raw_score": round(raw, 4),
            "denominator": M_DENOM,
        }

    # ----------------------------------------------------------- evaluation

    def evaluate_loop(
        self, m: float, t_pred: Optional[float] = None, gate: Optional[float] = None,
        sigma: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Two scales, two thresholds (fix F1):
          absolute — m against m_lock, directly in units of m;
          relative — r_rel against gate*sigma, through psi.
        Locks if either one fires (intersection-union: conservative,
        no multiplicity correction).
        """
        if t_pred is None:
            t_pred = self.t_pred_ema
        g = self.gate if gate is None else gate
        s = self.sigma if sigma is None else sigma
        if g <= 0.0 or s <= 0.0:
            # fail-closed, as in V2
            return self._decision(m, t_pred, 0.0, 0.0, 0.0, "CONFIG_DEGENERATE", g, s)

        r_rel = m - t_pred
        r_abs = m
        # The V2 anchor is preserved: an absolute deviation cannot be hidden by
        # a baseline that has adapted — but it is now judged on ITS OWN scale.
        psi_rel = math.exp(-(r_rel ** 2) / (2.0 * (g * s) ** 2))

        reasons: List[str] = []
        if r_abs >= self.m_lock:
            reasons.append(f"ABS_POLICY_DISTANCE m={r_abs:.4f} >= m_lock={self.m_lock}")
        if psi_rel < PSI_EXEC_MIN:
            reasons.append(
                f"REL_SURPRISE |r_rel|={abs(r_rel):.4f} > {self.rel_threshold():.4f} "
                f"(psi_rel={psi_rel:.4f})"
            )

        return self._decision(m, t_pred, r_rel, r_abs, psi_rel,
                              " ; ".join(reasons) if reasons else "NONE", g, s)

    def _decision(self, m, t_pred, r_rel, r_abs, psi_rel, reason, g, s) -> Dict[str, Any]:
        locked = reason != "NONE"
        # Delta_t fix: inside the executable zone psi ∈ [PSI_EXEC_MIN, 1], and the
        # mapping covers the WHOLE declared range — du_max is reachable, not decorative.
        if locked:
            delta_t = self.du_max
        else:
            span = 1.0 - PSI_EXEC_MIN
            frac = (1.0 - psi_rel) / span if span > 0 else 0.0
            delta_t = self.du_min + (self.du_max - self.du_min) * min(1.0, max(0.0, frac))
        return {
            "m": round(m, 4),
            "t_pred": round(t_pred, 4),
            "r_rel": round(r_rel, 4),
            "r_abs": round(r_abs, 4),
            "psi_rel": round(psi_rel, 4),
            "gate": g,
            "sigma": s,
            "m_lock": self.m_lock,
            "delta_t_sec": round(delta_t, 4),
            "decision": "EXECUTION_LOCK" if locked else "AUTO_EXECUTE",
            "lock_reason": reason,
            "timestamp": time.time(),
        }

    # ---------------------------------------------------------- calibration

    @staticmethod
    def calibrate(m_values: List[float], alpha: float = 0.05,
                  target_false_lock_rate: float = 0.01) -> Dict[str, Any]:
        """
        The anchor changed the question: we no longer look for a spread around a
        baseline, but for WHERE m LIES in normal operation. The threshold is a
        quantile of that distribution — no normality assumption.

        target_false_lock_rate=0.01 requires the 99th percentile → n ≳ 1000, not 250.
        The function refuses to return a threshold if n is insufficient for the
        requested quantile.
        """
        n = len(m_values)
        q = 1.0 - target_false_lock_rate
        n_needed = int(math.ceil(10.0 / target_false_lock_rate))
        if n < n_needed:
            raise ConfigError(
                f"n={n} is insufficient for the {q:.3f} quantile; ≳{n_needed} "
                f"observations are needed. At n={n} the tail rests on "
                f"{max(1, int(n*(1-q)))} points."
            )
        xs = sorted(m_values)
        idx = min(n - 1, int(math.ceil(q * n)) - 1)
        m_lock = xs[idx]

        # sigma for the relative component: residuals against an EMA with the same alpha
        ema, residuals = 0.0, []
        for x in m_values:
            residuals.append(x - ema)
            ema = alpha * x + (1.0 - alpha) * ema
        mean_r = sum(residuals) / n
        sigma = math.sqrt(sum((r - mean_r) ** 2 for r in residuals) / (n - 1))
        rel_se = 1.0 / math.sqrt(2.0 * (n - 1))

        return {
            "n": n,
            "m_lock_from_quantile": round(m_lock, 4),
            "quantile": q,
            "sigma_of_relative_residual": round(sigma, 6),
            "sigma_relative_SE_pct": round(rel_se * 100, 2),
            "max_gate_for_live_abs_threshold": round(m_lock / (K_PSI * sigma), 3)
            if sigma > 0 else None,
            "note": "These values are MEASURED. They transfer only to the schema/traffic "
                    "they came from.",
        }


if __name__ == "__main__":
    v = PayloadPolicyValidator()
    print(json.dumps(v.config_report(), indent=2, ensure_ascii=False))
