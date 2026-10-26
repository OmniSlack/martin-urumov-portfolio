# Provenance — agent-execution-control

Rule: originals are never modified. Every file here is a new copy; this table links each new file to the original it was made from.

Original: `NAVIGATOR_RUNTIME_R4_PG_FIX_R1.rar` · SHA-256 `ccc9fcb287bd2b9063a029a66b92042750d53da75444a57ce32226eb96df5392` · the working copy after the 2026-09-07 patches, `node_modules` included (not carried).

| Original file | Original SHA-256 | New file (this folder) | New SHA-256 | Change |
|---|---|---|---|---|
| test/helpers.ts | 62d102a8b2a190f515be3b86f99d1f34f3458c124ae0fe0b4ad3ae74584e0383 | test/helpers.ts | 514ff5b9a5f7962a274604f2eb640275369b6a18723b72af20de6985549f92c0 | duplicate nested STOP guard removed (TS2367); two comment lines added; behaviour unchanged (54/54) |
| test/unit/authority.test.ts | 90b4780aebebbd718d2fdd2d4bfaf8153f79464bc374acb4c23e2b51fe49732f | test/unit/authority.test.ts | e59042ed57996d4a4a9885a06ef300b2412f3616507f9461c7fc0121e0959f3b | one test title: "Martin issue" → "Human issue" |
| package.json | a0a4d1094e89b3da569bd8d4fe88673823deda2f472b56bf349b14ae0a3329e6 | package.json | 5fa3e7f990659663059fc080ca4d9b6176b425849e02ba9bb9425e18ceece880 | name "navigator-phase2-stage1" → "agent-execution-control" |
| CORE_REFERENCE.md | e79caa9153f14b93a54a2acd3ad2259eeb986f3a23aba41ba3c85f2ba1f3998f | AUTHORITY_MODEL.md | ed49e9f533b94569e1c817e6ca657f28c34f95127888b697edcae3beb1094d1a | rewritten: owner's name → "Human", rule-set name → "Core"; rules unchanged |
| SHA256SUMS.txt (frozen-package manifest) | 7c793839ecb44c08069a196191b95590d1fc021bb015848bbaf0613ad5c177cf | evidence/2026-08-17/ORIGINAL_SHA256SUMS.txt | same | byte-identical copy; 33/36 entries verify against this copy — the 3 mismatches are the files patched on 2026-09-07 |
| EVIDENCE_TYPECHECK.txt / EVIDENCE_UNIT.txt / EVIDENCE_POSTGRES.txt / IMPLEMENTATION_EVIDENCE.md | c87b9865ec4dedf13db1be1f862ddd855b56876865d28ca60fb551cc378e8898, eba9db3c3af5a9653711a3b08d8ceb1eaa7cf12b9f7a93bffe0eebf21e2a9958, 9f833bc83c30f56bd05e273c8c32755ebf8269b60124a90e085eafc416263454, 348cb2248a5daca3a247c0b0e58de9da59c6f1d008c3cc87caac2d66f4197628 | evidence/2026-08-17/ (same names) | same | byte-identical copies |
| EVIDENCE_SHA256.txt | 2da6717d15c61afd9a3b2fc0adb5c17c2b9525728ccabb534ebf58fb2e14cbe0 | — | — | not carried: a PowerShell hash listing with local Windows paths; its three hashes are stated in IMPLEMENTATION_EVIDENCE.md |
| src/, migrations/, test/ (all other files), package-lock.json, tsconfig.json, phase2.config.json, LIMITATIONS.md, LOCAL_RUN.txt, RUN_LOCAL.ps1 | per ORIGINAL_SHA256SUMS.txt | same paths | same | byte-identical copies |
| — | — | evidence/2026-10-26/ (4 files) | see SHA256SUMS at repository root | new: this repository's own run (typecheck, unit, PostgreSQL, environment) |
| — | — | tools/docker-shim-local-postgres.sh | see SHA256SUMS at repository root | new: the shim used to run the PostgreSQL suite without Docker |
| — | — | README.md | see SHA256SUMS at repository root | new |
