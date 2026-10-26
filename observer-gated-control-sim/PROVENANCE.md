# Provenance — observer-gated-control-sim

Rule: originals are never modified. Every file here is a new copy; this table links each new file to the original it was made from.

Original: `observer_control.py` · SHA-256 `f0c6ba72a9d1d85ae3db30daba9324b8f0aa0c320b2e702c8cffc4e583d4c800` · 9,038 bytes · dated 2026-07-13 in its header · supplied as a single loose file on 2026-10-25.

| Original file | Original SHA-256 | New file (this folder) | New SHA-256 | Change |
|---|---|---|---|---|
| observer_control.py | f0c6ba72a9d1d85ae3db30daba9324b8f0aa0c320b2e702c8cffc4e583d4c800 | observer_gated_control.py | 2e1108b0e4de9649f11e47c851f3c44276db437ea51f23b29ef4754a0dfa7bc4 | renamed by function; header/comments/labels in English; REFLEX → DIRECT; chart path, seed and clamp from the command line; matplotlib imported lazily; I_CLAMP 40 → 400 (defect fix, original value reachable with --i-clamp 40). Arithmetic unchanged: all eight arrays byte-identical to the original at --i-clamp 40, seeds 0–49 |
| — | — | test_observer_gated_control.py | 1979d19c3cd3066b1868163681a22196b58b67bbe5c5655167ccd9f7fb19ce14 | new: 13 tests |
| — | — | tools/seed_sweep.py | 7bbf7043ae9d06aa6eb7f04f75ea1b12452b31a2ddebe78f54b5d2de5bad7366 | new: 50-seed win counts and clean-regime cost |
| — | — | README.md | 4b78140133049f24d1e706d0420d387e890b8af251ba7d4226ab8ab3c44cec4a | new |
| — | — | evidence/2026-10-26/* | see SHA256SUMS at the repository root | new: TESTS.txt, METRICS_seed7_i_clamp400.txt, METRICS_seed7_i_clamp40.txt, SEED_SWEEP.txt, ENVIRONMENT.txt, two charts |

The equivalence check (eight output arrays, seeds 0–49, `--i-clamp 40`) was run against an unmodified copy of the original and a scratch copy of it with only a `seed` parameter added; neither copy is published, and the original file itself was not changed.
