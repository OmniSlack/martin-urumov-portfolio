# Provenance — document-claim-checker

Rule: originals are never modified. Every file here is a new copy; this table links each new file to the original it was made from.

Original: `omniecho_handoff_2026-09-16.zip` · SHA-256 `57211f0c838dea423ef330541bf429170c5e7b7da92e1d0dfee2d7228e4052eb` · 17,164 bytes · 12 entries. Its own `MANIFEST.sha256` lists `claim_check_fixed.py` as `910c0540…92d7`, which matches.

| Original file | Original SHA-256 | New file (this folder) | New SHA-256 | Change |
|---|---|---|---|---|
| kompas/claim_check_fixed.py | 910c05406567cc40907353b6c2997d95300fb55b7f3df33ef2003ebb549392d7 | document_claim_checker.py | 20f4ecd94691f9a4c1b04671ca9c93ddfdbdba971fd5c4177df693bd31cc16e5 | renamed by function; docstring, messages and comments in English; Bulgarian test-count word dropped from the pattern; 2026-10-26 fix: base-name fallback only for bare names (`_has_directory`, `path_not_found`), FAILED only when every name on the line resolves. Identical statuses to the original on 400 generated lines outside the fix |
| — | — | test_document_claim_checker.py | 1658fbfd3cd4aabbf6ffa6034103c213e462ce28bb1af90f7c08f2b24b133475 | new: 15 tests |
| — | — | tools/compare_with_original.py | bf23dd65e170add417f2fb4b4c45829ed350b80d1fd863ffc15b2fce16b92c32 | new: comparison with the original |
| — | — | README.md | b4d7f02237e9ad8a33ee1b89aedcb6e9adab34d568e12486538d5ac0d40239c2 | new |
| — | — | evidence/2026-10-26/TESTS.txt | 68eb85e1c9064e2c6f7aedec680db5b6a407e53b23be2aab4408683513844403 | new |
| — | — | evidence/2026-10-26/COMPARE_WITH_ORIGINAL.txt | 0234a0e123112a12e8cd5abae0ced1de489129058183b94095b95ee587d28019 | new |
| — | — | evidence/2026-10-26/ENVIRONMENT.txt | 0f0d32b08a7d644a0a96ee5b84608b999d2c8c8b039474b1db3e96041af952c4 | new |

Not carried: `HANDOFF.md` and `README.md` of the handoff (Bulgarian working notes covering several tools; the relevant findings are in this README), `kompas/sidecar_validator_v2.py` and `kompas/test_sidecar_v2_gaps.py` (already carried byte-identical in `payload-policy-validator/reference/`), `docker/*` (hardening for a different repository).

The earlier `claim_check.py`, its `test_claim_check.py` and the neighbouring `conflict_gate.py` named in the handoff were never received.
