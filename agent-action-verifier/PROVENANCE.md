# Provenance — agent-action-verifier

Rule: originals are never modified. Every file here is a new copy; this table links each new file to the original it was made from.

Original: `30_NAVIGATOR_MISSING_PARTS.zip` · SHA-256 `49b0ef5c4c2fa4cf48b68d85cc8582960ec8ee5751ea5ee16320e2335dde8d55` · 8,384 bytes · 6 files dated 2026-09-07 · item 30 of the document package `OMNIECHO__PAKET_2026-09-07`, whose own `SHA256SUMS.txt` lists the zip under the same hash.

| Original file | Original SHA-256 | New file (this folder) | New SHA-256 | Change |
|---|---|---|---|---|
| envelope.js | c5db60c1812ef7f26102b348f756b78b4b43c3f6b495fa527ba2743618eb1f04 | envelope.js | 3cee99b86e8b2c675803611f4777a764a84dc0875c1a712ef972f01a1007c332 | Finding 1 fixed fail-closed: `NON_MATERIAL_FIELDS` added, unlisted fields compared and hashed; the seven-field comparison and canonical form unchanged |
| attempt.js | 0093307f1ba7f710c93fdf9916ac98f352d8dca677222d32b2d0cddf845b1d57 | attempt.js | 0093307f1ba7f710c93fdf9916ac98f352d8dca677222d32b2d0cddf845b1d57 | none — byte-identical |
| verifier.js | b76505d5f69eea0dfd66044407db424ca77d90c3b215030763892a1b47a61c62 | verifier.js | 9b2fc77c87cddde488e4ff62e51b9eb5ee3f5a0305ca5f4dd5903326ee02fd74 | `effect` field added to the returned object and documented; no existing field or value changed |
| test.js | 45c3c776c20b6406c38a281acb29ae450c815252647ea85dc8bf9e1b5fa72cd3 | test.js | a7977ed30b7316bcec18d0bff1a8ae0ee8a34a612f2383ca2eb3efaa4bf9010a | `humanId: 'martin'` → `'operator-1'`; eight tests appended (22 → 30) |
| LIMITATIONS.md | 005495ff08a96742e6547671668923a90e9e49f6f8cd4af4ff6065a6e49a475f | — | — | not carried: content folded into README.md with the Finding-1 correction; it named the specification author in Cyrillic |
| SHA256SUMS.txt | 84ba649c3c214558f1f5aaae062038dd2f9c4bc2222aa5ba824d71468954db26 | — | — | not carried as a file; reproduced below |
| — | — | README.md | dea18b4c5617a2ccf1894ecd8e27517fc3e9e112250f0ed001204ece2e0c94cb | new |
| — | — | evidence/2026-10-26/TESTS.txt | 4c44e4a06f5776c2b93b580416be39fdd0f0314500fe9195d8578a7419978d3b | new: the three test runs and the fuzz result |

The package's own hash list (`SHA256SUMS.txt`, verified 5/5 against the extracted files on 2026-10-26):

```
c5db60c1812ef7f26102b348f756b78b4b43c3f6b495fa527ba2743618eb1f04  envelope.js
0093307f1ba7f710c93fdf9916ac98f352d8dca677222d32b2d0cddf845b1d57  attempt.js
b76505d5f69eea0dfd66044407db424ca77d90c3b215030763892a1b47a61c62  verifier.js
45c3c776c20b6406c38a281acb29ae450c815252647ea85dc8bf9e1b5fa72cd3  test.js
005495ff08a96742e6547671668923a90e9e49f6f8cd4af4ff6065a6e49a475f  LIMITATIONS.md
```
