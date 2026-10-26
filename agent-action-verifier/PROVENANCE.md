# Provenance — agent-action-verifier

Rule: originals are never modified. Every file here is a new copy; this table links each new file to the original it was made from.

Original: `30_NAVIGATOR_MISSING_PARTS.zip` · SHA-256 `49b0ef5c4c2fa4cf48b68d85cc8582960ec8ee5751ea5ee16320e2335dde8d55` · 8,384 bytes · 6 files dated 2026-09-07 · item 30 of the document package `OMNIECHO__PAKET_2026-09-07`, whose own `SHA256SUMS.txt` lists the zip under the same hash.

| Original file | Original SHA-256 | New file (this folder) | New SHA-256 | Change |
|---|---|---|---|---|
| envelope.js | c5db60c1812ef7f26102b348f756b78b4b43c3f6b495fa527ba2743618eb1f04 | envelope.js | 6761068cf6531716f385b52922361bbe8f4247a060747feecf4a94b8a0d5e4f2 | one comment block rewritten (the unreachable-branch note); code unchanged |
| attempt.js | 0093307f1ba7f710c93fdf9916ac98f352d8dca677222d32b2d0cddf845b1d57 | attempt.js | 0093307f1ba7f710c93fdf9916ac98f352d8dca677222d32b2d0cddf845b1d57 | none — byte-identical |
| verifier.js | b76505d5f69eea0dfd66044407db424ca77d90c3b215030763892a1b47a61c62 | verifier.js | 9b2fc77c87cddde488e4ff62e51b9eb5ee3f5a0305ca5f4dd5903326ee02fd74 | `effect` field added to the returned object and documented; no existing field or value changed |
| test.js | 45c3c776c20b6406c38a281acb29ae450c815252647ea85dc8bf9e1b5fa72cd3 | test.js | 490c653b33bbd94ff5f4b779f0641cf4d3c267f1353a84a6e8fe0639d9f16485 | `humanId: 'martin'` → `'operator-1'`; four tests appended (22 → 26) |
| LIMITATIONS.md | 005495ff08a96742e6547671668923a90e9e49f6f8cd4af4ff6065a6e49a475f | — | — | not carried: content folded into README.md with the Finding-1 correction; it named the specification author in Cyrillic |
| SHA256SUMS.txt | 84ba649c3c214558f1f5aaae062038dd2f9c4bc2222aa5ba824d71468954db26 | — | — | not carried as a file; reproduced below |
| — | — | README.md | 263b1e93682d7b4f7627a2738689d271b5c49421eeb1221e660990f3ad52feea | new |
| — | — | evidence/2026-10-26/TESTS.txt | 83232d65f583fa0c22eea33448103aeea4ca712047fdfb865943cb7b9513caf6 | new: the three test runs |

The package's own hash list (`SHA256SUMS.txt`, verified 5/5 against the extracted files on 2026-10-26):

```
c5db60c1812ef7f26102b348f756b78b4b43c3f6b495fa527ba2743618eb1f04  envelope.js
0093307f1ba7f710c93fdf9916ac98f352d8dca677222d32b2d0cddf845b1d57  attempt.js
b76505d5f69eea0dfd66044407db424ca77d90c3b215030763892a1b47a61c62  verifier.js
45c3c776c20b6406c38a281acb29ae450c815252647ea85dc8bf9e1b5fa72cd3  test.js
005495ff08a96742e6547671668923a90e9e49f6f8cd4af4ff6065a6e49a475f  LIMITATIONS.md
```
