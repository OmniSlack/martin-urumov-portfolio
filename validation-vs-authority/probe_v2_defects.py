"""Empirical proof that each audited defect is REAL in v2 and CLOSED in v3."""
from sidecar_validator_v2 import SidecarValidatorV2
from sidecar_validator_v3 import SidecarValidatorV3, ExecutionControl, HumanPermit
from datetime import datetime, timedelta, timezone

NOW = datetime(2026, 9, 15, 12, 0, tzinfo=timezone.utc)
permit = HumanPermit("doc-1", "write", "project-a", "martin", NOW + timedelta(hours=1))
v2, v3 = SidecarValidatorV2(), SidecarValidatorV3()
ec = ExecutionControl(v3)

def row(name, v2_result, v3_result):
    print(f"{name:<42} v2: {v2_result:<28} v3: {v3_result}")

print("=" * 100)
row("DEFECT", "v2 BEHAVIOUR", "v3 BEHAVIOUR")
print("=" * 100)

# 1. authority leak: .allowed exists on v2
row("Decision.allowed exists (authority leak)",
    str(hasattr(v2.evaluate_loop(m=0.0), "allowed")),
    str(hasattr(v3.validate(m=0.0), "allowed")))

# 2. validator emits an execute-shaped verdict
row("verdict on clean input",
    v2.evaluate_loop(m=0.0).decision,
    v3.validate(m=0.0).decision)

# 3. disabled -> fail open
row("enabled=False, m=99",
    SidecarValidatorV2(enabled=False).evaluate_loop(m=99.0).decision,
    SidecarValidatorV3(enabled=False).validate(m=99.0).decision)

# 4. NaN bypass
row("m = NaN",
    v2.evaluate_loop(m=float('nan')).decision,
    v3.validate(m=float('nan')).decision)

# 5. truthy non-bool authorization
row('authorized="false" (truthy string)',
    v2.evaluate_loop(m=0.0, authorized="false").decision,
    ec.request(target="doc-1", action="write", scope="project-a",
               m=0.0, permit="false", now=NOW).decision)

# 6. required field skipped when payload is None
v2b = SidecarValidatorV2(required_fields=("request_id",))
v3b = SidecarValidatorV3(required_fields=("request_id",))
row("required_fields with payload=None",
    v2b.evaluate_loop(m=0.0, payload=None).decision,
    v3b.validate(m=0.0, payload=None).decision)

# 7. keyword false positive
row('payload "dropdown menu"',
    v2.evaluate_loop(m=0.0, payload={"ui": "dropdown menu"}).decision,
    v3.validate(m=0.0, payload={"ui": "dropdown menu"}).decision)

# 8. keyword bypass
row('payload "d e l e t e"',
    v2.evaluate_loop(m=0.0, payload={"op": "d e l e t e"}).decision,
    v3.validate(m=0.0, payload={"op": "d e l e t e"}).decision)

# 9. NaN threshold accepted at construction
try:
    SidecarValidatorV2(hard_threshold=float('nan')); a = "accepted"
except ValueError: a = "refused"
try:
    SidecarValidatorV3(hard_threshold=float('nan')); b = "accepted"
except ValueError: b = "refused"
row("hard_threshold=NaN at construction", a, b)

# 10. clean math with NO permit
row("clean math, no permit at all",
    v2.evaluate_loop(m=0.0).decision,
    ec.request(target="doc-1", action="write", scope="project-a",
               m=0.0, permit=None, now=NOW).decision)
print("=" * 100)
