# What running V2 found · 2026-09-16

V2 is kept here as a **reference**, so that the findings are reproducible. It is not for use.

File: `reference/validator_v2_as_received.py` — byte-identical to the received copy
(SHA-256 `d7ca1c41…4488`).

What V2 fixed correctly and what V3 keeps:
- `r_effective = max(|m|, |m - t_pred|)` — the adaptive baseline can no longer hide
  high risk. The anchor is right and V3 preserves it (test `V2_AnchorPreserved`).

What running it showed does not work (all numbers at sigma=0.05):

| # | Found | Consequence |
|---|---|---|
| F1 | psi<0.85 ⟺ r > gate·σ·0.5701, and r_eff ≥ \|m\| always | the threshold on m is 0.0855 (gate=3), 0.0285 (gate=1), 0.0143 (gate=0.5) |
| F2 | `max_m_threshold=0.35` | never changes a decision — only relabels; it would need gate>12.3 |
| F3 | `m = discrepancies/(len(required_fields)+2)` | a schema with 10 fields: one missing field → m=0.083 → **AUTO_EXECUTE** |
| F4 | keywords matched as substrings of `json.dumps` | "confirm", "alarm", "format" fire the keyword "rm" |
| — | `du_max=1.8` | in the executable zone delta_t ≤ 0.3125 s; 1.8 is unreachable |

Reproduce F3 and F4 (from this folder):

    cd reference
    python3 -c "
    from validator_v2_as_received import SidecarValidatorV2 as V
    v=V()
    sch={'required_fields':[f'f{i}' for i in range(10)]}
    pay={f'f{i}':1 for i in range(9)}
    m=v.compute_policy_discrepancy(pay,sch)
    print('F3:', m, v.evaluate_loop(m,0.0,3.0)['decision'])
    sch2={'required_fields':['user'],'risk_keywords':['rm']}
    print('F4:', v.compute_policy_discrepancy({'user':'confirm'},sch2))
    "

Expected output:

    F3: 0.08333333333333333 AUTO_EXECUTE
    F4: 0.5
