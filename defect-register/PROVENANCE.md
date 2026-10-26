# Provenance — defect-register

Rule: originals are never modified. Every file here is a new copy; this table links each new file to the original it was made from.

Original: repository OmniSlack/omniecho-core (private), branch `claude/bro-6f3f37`, commit `848ae1a6264fb0cb31a99921a7fd569824e956ec` (2026-10-13), read from a clone; the same commit is the head of the bundle `omniecho-222.bundle`.

| Original file | Original SHA-256 | New file (this folder) | New SHA-256 | Change |
|---|---|---|---|---|
| verify/greshki.js | 8364a76c853f34fba2f7f605218408dcfa28e2ede121310728e0e55ae93a5733 | register.json | 2df5c363066675a806fb926341ca95a0ecf7f0c3bf700941775f1479a3dd251d | the 165 entries (fields `kakvo`, `forma`, `kak_namerena` translated in full; `koy` → `found_by`; `semeystvo` → English family key; ids transliterated from Cyrillic: Pe→P, Be→B, Em→M) |
| verify/greshki.js | 8364a76c853f34fba2f7f605218408dcfa28e2ede121310728e0e55ae93a5733 | families.json | 98499d37dca8eaaf2fd31dc7164a159312919234172f86492a19209609462897 | `SEMEYSTVA`, 22 families, translated; original key kept as `original_key` |
| verify/greshki.js | 8364a76c853f34fba2f7f605218408dcfa28e2ede121310728e0e55ae93a5733 | register.js | 38f9b95d8ce30c675c8830d73dbe0bc7174e28adf06b38275df5199fd35e23d4 | helpers `D`, `KOY`, `NOVO_OT`, `sravni`, `po_semeystva`, `otvorena_dlan`, `star_nov` and the CLI, translated; detectors match English and (via \u escapes) the original Bulgarian words |
| verify/znaci.js | fa780149a6873f302ea5a1fdcfe36e62eb1ba7a8ffac8efddd4d46dbcfba6a5a | confidence-scale.js | 1abcc8f7e2e9d8ac93f9325971422976977bb2c7d898a2ce0d2f5e511fd3c7fe | the seven scale levels and the line printer only |
| verify/cedki.js | e842844faceb05721af3ddf576f1f5393ca75c2340d9660b8f578a54ea650baa | filters.js | 85601a2e96a6c2ccb80020a8dd27dab530bfae64a2c3c109832a0948251ffa26 | the three exceptions (`IZKLUCHENIYA`) only, translated; the filters and four questions are not carried |
| — | — | register.test.js | 070d2e68a139d9bde0c56ca5217a73606ebd46e8d7c679c335b363a8732520e1 | new: 21 tests incl. equivalence with the original helpers |
| — | — | stats.js | d70ff7433bc2d93ab8898c6451f52deadd5a92080a78a3b530a1b56e14e3d54d | new: counts by finder, family, date, prefix |
| — | — | fixtures/original-helper-outputs.json | cf56ec46072565ca67c518af51c373b18cfc10d45c837ef9b2528ff9e08b05bb | new: outputs of the original helpers, run unmodified on the original data (ASCII; Bulgarian inputs as \u escapes) |
| — | — | README.md | 0af9d0cff5065dba2e4b43426ff0cc0ed9f284f5384a91036a9627387388e3d0 | new |
| — | — | evidence/2026-10-26/* | see SHA256SUMS at the repository root | new: TESTS.txt, STATS.txt, VALIDATION.txt, ENVIRONMENT.txt |

The translation was done in 13 part files in a scratch directory and merged by a script that checks: exactly 165 entries, ids unique and in the original order, 51 human / 114 instrument, every family key valid, zero Cyrillic (output in `evidence/2026-10-26/VALIDATION.txt`). The part files and the script are not carried.
