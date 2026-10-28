# Provenance — validation-vs-authority

Rule: originals are never modified. Every file here is a new, byte-identical copy; the SHA-256 of each file equals the original's.

Source: a working folder on the owner's computer, sent as single files on 2026-10-28. Dates below are the file modification times shown in that folder (local time, UTC+3). The v2 reference was sent on 2026-10-26.

| Original file | Modified | SHA-256 | File here |
|---|---|---|---|
| sidecar_validator_v3.py | 2026-09-15 22:01 | ed48447d9a8e4deb1fb3bd7e85da5cee008a92db9ed774aff5814b5ab9c4a2d9 | same name |
| test_sidecar_v3_authority.py | 2026-09-15 22:01 | 9e3195991b364eca33e0bca60f415fa9fb6dfb8b20eba5dc1700992f92a8f11d | same name |
| execution_ticket.py | 2026-09-15 22:01 | 79b5fed28ae328a75e0a457a7962c7e09fed249f27261362aa919809be0175d5 | same name |
| test_execution_ticket.py | 2026-09-15 22:01 | c324f85a1323236d6be0d10a8f73d91384cc15b53c57e622fb1a8d2fc23faa53 | same name |
| kompas_core.py | 2026-09-15 22:01 | 11291e27eea9609f1b2eb0144ea4552f904dd50b2b090263d34607b1d72f59e2 | same name |
| test_kompas_core.py | 2026-09-15 22:01 | 2744344919db45668d26f90fb3fe79323f8df9d250b2a21f5fb8157a1bc73aa2 | same name |
| probe_v2_defects.py | 2026-09-15 22:01 | 383a8d6c4879928e7b33400e2a3836dc4629a64d5fb238f454a296ef6e62730d | same name |
| test_injection_neutralization.py | 2026-09-15 22:01 | 798332d5a8d843684d14164a3f60b3ec1a8d6a0e4ce2b5f91c58ab20f47be5f0 | same name |
| conflict_gate.py | 2026-09-16 03:28 | 9ce42a8506eba1ee02acb38b3c520429540ac030aab4a668be46181c724a633b | same name |
| test_conflict_gate.py | 2026-09-16 03:29 | 4abdce37816246b6369740cc345abed102e53e445e9a3b35769e7c5f1792a6b4 | same name |
| guarded_turnlog.py | 2026-09-16 03:52 | 99b310b2ed4538113bc1e725e3a98d5dd1bcab32e711a7b6dc7f25646958bdcd | same name |
| test_guarded_turnlog.py | 2026-09-16 03:53 | 846df36995d1f5b7b91300c308a85f8620f17f27ddfac7e67a7d0364d7f51e14 | same name |
| claim_check.py | 2026-09-16 07:01 | 7aa8d3587e653ffdb350aed08e2c786a894bfa31984c681a9429925c4e2ecacc | same name |
| test_claim_check.py | 2026-09-16 07:18 | 7260c6fe35b50e9ece64186992c88eafab87656e8ab212d4213940e057f4e6b8 | same name |
| sidecar_validator_v2-2.py (sent 2026-10-26; a second upload `-3` is the same bytes) | — | 85891e69ed8e60c9bf9c5fcfc0006fe025cd1d296b26c78011e34b227eb0afc1 | reference/sidecar_validator_v2.py |

**Not copied:** `turnlog.py` (replaced by `guarded_turnlog.py`); `wired_test.py` (connects `test_sidecar_v2_gaps.py` to v2 — that test file is already in [`payload-policy-validator/reference/`](../payload-policy-validator/reference/)); the `.pyc` files in `__pycache__` (compiled copies; the 16-byte headers of the two checked record the same source size and time as the `.py` files above).

**Cross-checks.**
- The `.pyc` of `sidecar_validator_v3` records source size 10,249 bytes and source time 2026-09-15 19:01 UTC (22:01 local) — the same file as here.
- The v2 reference here is the same file (`85891e69…`) that `payload-policy-validator/reference/sidecar_validator_v2_alternative.py` carries and labels "Codex, 2026-10". Its interface is exactly the one `probe_v2_defects.py` and `sidecar_validator_v3.py` (2026-09-15) were written against, and `wired_test.py` (modified 2026-09-15 22:01) cites "the file's own WIRING note" inside its companion test file `test_sidecar_v2_gaps.py`. So this v2 existed by 2026-09-15; "2026-10" is when it was received in that folder, not when it was written.
