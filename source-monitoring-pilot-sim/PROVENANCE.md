# Provenance — source-monitoring-pilot-sim

Rule: originals are never modified. Every file here is a new copy; this table links each new file to the original it was made from.

Originals:
- `PILOT_A_PYTHON_RECONSTRUCTION_v1_r6.zip` · SHA-256 `964d602f139f6957146b97a210c3f00d9ac0d181dd4438536eb66534d1f5646b` · 929,457 bytes · 196 files under `PILOT_A_PYTHON_RECONSTRUCTION_v1/`. A second upload named `…_r62.zip` has the same hash (one archive, two names).
- `PILOT_A_R6_MINIMAL_RUN_PACKET.zip` · SHA-256 `75ffcd27b88760b461a5f08d7847935c4d71d852acdda3e12d4dd7862bcfab8c` · 10,134 bytes · 4 files.

## Package → this folder

| Original file | Original SHA-256 | New file (this folder) | New SHA-256 | Change |
|---|---|---|---|---|
| *(all 190 files of the package except the six below)* | see `SHA256SUMS` at the repository root; each file byte-identical to the package | same path | same hash | none — carried unchanged (190 of 190 compared) |
| README.md | 40fe0afb2e956fc2a7ab9695c1987bfed9ee6e6a519ba66ca9f1c633388ed438 | — | — | not carried: package README (signed, mixed-language, names the author's pseudonym); replaced by README.md |
| REVISION_REPORT_r2.md | d16617a60733326a884af7a6f6e7f97216fb22c435337c23421972677577d15b | — | — | not carried: signed mixed-language revision report; content consolidated in HISTORY.md |
| LOCK_IMPLEMENTATION_REPORT_r3.md | 14ecd9975e645b7abcd79fd0c1596c6eac15efa6d5930409a5b579afb3e3ae46 | — | — | not carried: signed mixed-language revision report; content consolidated in HISTORY.md |
| PILOT_A_r3__FULL_POWER_REPORT_v1.md | 53a9559f60995d8fb407be1b53bdd7ac6dfafefc0dd2d81f9f3b58adf4de32b3 | — | — | not carried: signed mixed-language revision report; content consolidated in HISTORY.md |
| POWER_RUNNER_FIX_REPORT_r5.md | d20fd755423b1512b81d45ccc09b4393e537a10dae4a44c70d443b8560b95a9b | — | — | not carried: signed mixed-language revision report; content consolidated in HISTORY.md |
| POWER_RUNNER_HARDENING_REPORT_r6.md | 6ed16932be07ff0b466ee734b4a355e88b5edd1079782bc3de314bd9d1e58952 | — | — | not carried: signed mixed-language revision report; content consolidated in HISTORY.md |
| — | — | README.md | 2389b873ed4ca413ed480658bdd7642012d62a53c3758c56f3bce709abe44372 | this folder's README, written 2026-10-26 |
| — | — | HISTORY.md | 182c6eebd4fcf66ea5bee7df32b3afd31355b3b8fdd26a19ac78de8e63fb5c9d | English consolidation of the five reports and the 2026-10-25/26 reproduction |
| — | — | tools/determinism_check.py | 15c15824728dec52024354f31f5ddde01c290a00cf18aefe0db654e2cc8e5224 | new: reruns unit 30 twice and compares with the shipped reference |
| — | — | evidence/2026-10-25/TESTS.txt | 5d8d9857d8a94f21547bffd9709aba0366f6bf4640224a68bf6d931cbc2d2176 | new: test-suite output of 2026-10-25 (45/45) |
| — | — | evidence/2026-10-26/TESTS.txt | c500258b097e61532b503ece8ae0c9a9797516e24f2650078f0263bdfbfff753 | new: test-suite output of 2026-10-26 (43/45) |
| — | — | evidence/2026-10-26/RUN_ALL.txt | d965e799fbdf6f8880fd98acd208a60e240e6263f7de2adb012d02a677e09828 | new: run_all.py output of 2026-10-26 |
| — | — | evidence/2026-10-26/DETERMINISM_CHECK.txt | 45973d9926d4e6449230824f06a1bae5352513788ab61d2a101f807054bfbc25 | new: output of tools/determinism_check.py |
| — | — | evidence/2026-10-26/ENVIRONMENT.txt | 0485d2f3c9cd3a4d36292b715d0ee7601febc1ea3a5b855f9e650cd4ce722f53 | new: environment of the reproduction |

Check of the carried files against the package: 190 compared, 190 byte-identical (`cmp` per file, 2026-10-26). The package's own hash lists still verify from this folder's root: `outputs/r_validation/power_r5_smoke/hashes.txt` and `power_r6_smoke/hashes.txt` — 2 of 2 OK each; `power_full/power_full_hashes.txt` (r3) — `analysis_R/power_simulation.R` and `fit_glmm.R` OK, `config/power_simulation.json` FAILED because r5 added one key to it (documented in HISTORY.md), and the r3 archive and lock document it also lists were never part of this package.

## Run packet → this folder

| Original file | Original SHA-256 | New file (this folder) | New SHA-256 | Change |
|---|---|---|---|---|
| PILOT_A_R6_MINIMAL_RUN_PACKET/README.txt | 9c6192ddaad411a36f34bd0ee97d4cd3435eb0d38b1f3f260853a8610e73a68a | r-run-packet/README.txt | same | none; `analysis_R/power_full_run_r6.R` and `config/power_simulation.json` are byte-identical to the package's copies |
| PILOT_A_R6_MINIMAL_RUN_PACKET/SHA256SUMS.txt | 9d6f1ed6f814231ab2f41ff9f41914ea8c21e25353f0055123f47030c4ecfea4 | r-run-packet/SHA256SUMS.txt | same | none; `analysis_R/power_full_run_r6.R` and `config/power_simulation.json` are byte-identical to the package's copies |
| PILOT_A_R6_MINIMAL_RUN_PACKET/analysis_R/power_full_run_r6.R | 0020c7ffcb433cb1b10d06bdd9f59462ad8d45232a7739536b7fab182e37710d | r-run-packet/analysis_R/power_full_run_r6.R | same | none; `analysis_R/power_full_run_r6.R` and `config/power_simulation.json` are byte-identical to the package's copies |
| PILOT_A_R6_MINIMAL_RUN_PACKET/config/power_simulation.json | dd2ff489cc5f4dd1575773294ad8764c446033932265cb18f53cefd1f6370794 | r-run-packet/config/power_simulation.json | same | none; `analysis_R/power_full_run_r6.R` and `config/power_simulation.json` are byte-identical to the package's copies |

`r-run-packet/SHA256SUMS.txt` is the packet's own list; `sha256sum -c SHA256SUMS.txt` inside `r-run-packet/` passes 3 of 3.
