import json, math, time
from typing import Dict, Any, Optional

class SidecarValidatorV2:
    def __init__(self, alpha=0.05, default_sigma=0.05, max_m_threshold=0.35):
        self.alpha=alpha; self.default_sigma=default_sigma
        self.max_m_threshold=max_m_threshold; self.t_pred_ema=0.0
    def update_baseline(self, m_observed):
        self.t_pred_ema = self.alpha*m_observed + (1.0-self.alpha)*self.t_pred_ema
        return self.t_pred_ema
    def compute_policy_discrepancy(self, payload, schema_rules):
        discrepancies=0.0
        required_fields=schema_rules.get("required_fields",[])
        allowed_fields=schema_rules.get("allowed_fields",[])
        risk_keywords=schema_rules.get("risk_keywords",[])
        total_checks=len(required_fields)+2
        for field in required_fields:
            if field not in payload: discrepancies += 1.0
        if allowed_fields:
            extra=set(payload.keys())-set(allowed_fields)
            if extra: discrepancies += min(1.0, len(extra)*0.5)
        s=json.dumps(payload)
        for kw in risk_keywords:
            if kw in s: discrepancies += 1.5
        return min(1.0, discrepancies/max(1.0,float(total_checks)))
    def evaluate_loop(self, m, t_pred, gate, sigma=None, du_min=0.05, du_max=1.8):
        if sigma is None: sigma=self.default_sigma
        r_rel=m-t_pred; r_abs=m
        r_effective=max(abs(r_abs),abs(r_rel))
        denom=2.0*((gate*sigma)**2)
        psi=math.exp(-(r_effective**2)/denom) if denom>0 else 0.0
        delta_t=du_min+(du_max-du_min)*(1.0-psi)
        if m>=self.max_m_threshold:
            decision="EXECUTION_LOCK"; reason=f"HARD_THRESHOLD m={round(m,4)}>={self.max_m_threshold}"
        elif psi<0.85:
            decision="EXECUTION_LOCK"; reason=f"LOW_TRUST psi={round(psi,4)}<0.85"
        else:
            decision="AUTO_EXECUTE"; reason="NONE"
        return {"m":round(m,4),"psi":round(psi,4),"r_eff":round(r_effective,4),
                "dt":round(delta_t,4),"decision":decision,"reason":reason}
