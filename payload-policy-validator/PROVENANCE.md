# Provenance — payload-policy-validator

Rule: originals are never modified. Every file here is a new copy; this table links each new file to the original it was made from.

Original package: `SIDECAR_VALIDATOR_V3__2026-09-16.zip` · SHA-256 `dbc9ede665e00796d5e5d0fea5be6b99881baea8c5e5da70e7ac6fb5750bfb85`

| Original file (inside the package) | Original SHA-256 | New file (this folder) | New SHA-256 | Change |
|---|---|---|---|---|
| sidecar_validator_v3.py | 231278fe691b403e086e932c0d6219b91c78a649a1505ab93a50719eb54f9f11 | payload_policy_validator.py | 7825455e6c9e4b52020f2a4e76576f0e858fa595ed2cee25f0df4154eb176add | renamed by function; class renamed; comments translated; logic unchanged (20,000-input equivalence check: 0 differences) |
| test_sidecar_v3.py | 90117d90d99675697f8ed14292fcb9eda4708de7120536bc1358ec4e85c23cb7 | test_payload_policy_validator.py | 619c1885e554997b1732958b8c35ad136319e0059a2fba65eeefb6e347d73af7 | import and class name updated; comments translated; 17 tests unchanged |
| reference_v2/sidecar_validator_v2__as_received.py | d7ca1c4101c5d8dd6a2f170d5674b441722285f6134f1f238552a774a22f4488 | reference/validator_v2_as_received.py | d7ca1c4101c5d8dd6a2f170d5674b441722285f6134f1f238552a774a22f4488 | byte-identical copy |
| reference_v2/NAMERENO_V_V2.md | b2822e23be60944dfabdf6baddcb54325f461878ca2062065b9b2369123695a6 | FINDINGS_V2.md | e031d3f2a46f36729cfbe709a6d1042a46fa2e33e3100720e822d259005b2a02 | translated; reproduction command path updated |
| 00_PROCHETI.md | 67586d7d866e067ee75f9a27ff09abaa1944ea11d88304f4ea825b792d59cb57 | README.md | d9e6416c4a50a80b326dcc1e70f8030eb40dfb3b5daab0f7dc2d37f1fd55f519 | rewritten in English in the portfolio README format; facts and numbers carried over |
| INVENTAR.sha256 | 3cd2c98256e9ea88c99d1ed3f2f19ae7d26198eacc659ee072b7c468644f24f4 | — | — | superseded by this table and the root SHA256SUMS |

## Added 2026-10-26

| Original file | Original SHA-256 | New file (this folder) | New SHA-256 | Change |
|---|---|---|---|---|
| sidecar_validator_v2-3.py (from Codex; a second upload `sidecar_validator_v2-2.py` is the same bytes) | 85891e69ed8e60c9bf9c5fcfc0006fe025cd1d296b26c78011e34b227eb0afc1 | reference/sidecar_validator_v2_alternative.py | 85891e69ed8e60c9bf9c5fcfc0006fe025cd1d296b26c78011e34b227eb0afc1 | byte-identical copy, renamed by function |
| test_sidecar_v2_gaps-1-1.py (from Codex) | 389303caa79676c151167c08e5933ee6280436f3ee7eed0b8d45d20e6f768bed | reference/test_sidecar_v2_gaps.py | 389303caa79676c151167c08e5933ee6280436f3ee7eed0b8d45d20e6f768bed | byte-identical copy |
| — | — | flag_hold_validator.py | 0fdefb948cad6dec08be8e6122497600ef0adb92d651b4d8da18b0eb7ccaf68f | new: the flag-and-hold copy; imports V3, does not modify it |
| — | — | test_flag_hold_validator.py | 369b153b05302eb1467608901e39265114ce1f589590fa3bc664c234d2082e5a | new: 14 tests |
| — | — | evidence/2026-10-26/FLAG_HOLD.txt | a3c240555a90b50ae25ba167bbc5e456d9af2ae5208b0812a0390973851e6ca5 | new |

`payload_policy_validator.py` (V3) is unchanged; `test_v3_file_is_byte_identical_to_the_published_copy` checks it against the root `SHA256SUMS`. The README hash in the table above is from before this addition; the current one is in the root `SHA256SUMS`.
