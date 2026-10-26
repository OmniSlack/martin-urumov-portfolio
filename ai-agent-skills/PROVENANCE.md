# Provenance — ai-agent-skills

Rule: originals are never modified. Every file here is a new copy; this table links each new file to the original it was made from.

Source: `OmniSlack/omniecho-core`, branch `claude/bro-6f3f37`, commit `848ae1a6264fb0cb31a99921a7fd569824e956ec` (2026-10-13), folder `.claude/skills/`. Original hashes are SHA-256 of the files at that commit.

| Original file | Original SHA-256 | New file | New SHA-256 | Change |
|---|---|---|---|---|
| .claude/skills/omniecho/SKILL.md | 2e6661f5fc1d32266d7e633377c98aaa99ef1215d3daeaecd7e67d0ca60abad9 | original-bg/omniecho/SKILL.md | 2e6661f5fc1d32266d7e633377c98aaa99ef1215d3daeaecd7e67d0ca60abad9 | byte-identical copy |
| .claude/skills/nemoga/SKILL.md | c0d4ef7b3845c74700d121ec87aad4adfd04779198709a9145a82316856f8ed8 | original-bg/nemoga/SKILL.md | c0d4ef7b3845c74700d121ec87aad4adfd04779198709a9145a82316856f8ed8 | byte-identical copy |
| .claude/skills/razdelyashto/SKILL.md | f33673439ff0c14c92b5daeee8cf1821b02310d623e57b8baa1635c1d1ab2570 | original-bg/razdelyashto/SKILL.md | f33673439ff0c14c92b5daeee8cf1821b02310d623e57b8baa1635c1d1ab2570 | byte-identical copy |
| .claude/skills/izmerimo/SKILL.md | 7547911e5c6e4da9368979b48c60b80691cec170c2841390b6801477b9500f69 | original-bg/izmerimo/SKILL.md | 7547911e5c6e4da9368979b48c60b80691cec170c2841390b6801477b9500f69 | byte-identical copy |
| .claude/skills/dvoynik/SKILL.md | 000a4a568414cfb4ee502de5fa903f481f3625fa5223edad6273d4f70325d1eb | original-bg/dvoynik/SKILL.md | 000a4a568414cfb4ee502de5fa903f481f3625fa5223edad6273d4f70325d1eb | byte-identical copy |
| .claude/skills/dvoynik/izigran-sluchay.js | 21529d80750d781681f209c26e626dc9d67284b5de56b2054d84c7bf8301dcf6 | original-bg/dvoynik/izigran-sluchay.js | 21529d80750d781681f209c26e626dc9d67284b5de56b2054d84c7bf8301dcf6 | byte-identical copy |
| .claude/skills/omniecho/SKILL.md | 2e6661f5fc1d32266d7e633377c98aaa99ef1215d3daeaecd7e67d0ca60abad9 | skills/claim-discipline/SKILL.md | 1bddc5802c149d541646579599c9a019e6428c82cf928f416d5f6a00271d0f09 | renamed; translated; pseudonym removed; tool references mapped to this repository or marked as not carried; the commands that run the original's network probes (all.js) removed; register counts updated to this repository's register (165 / 22) |
| .claude/skills/nemoga/SKILL.md | c0d4ef7b3845c74700d121ec87aad4adfd04779198709a9145a82316856f8ed8 | skills/report-scope/SKILL.md | deb506056dc80a2b22fedce27359403437f6e6e9dc82a8e8f55169ca337aa92b | renamed; translated; the probe runner (nemoga.js) marked as not carried and not run; B-13 linked to defect-register |
| .claude/skills/razdelyashto/SKILL.md | f33673439ff0c14c92b5daeee8cf1821b02310d623e57b8baa1635c1d1ab2570 | skills/distinguishing-observation/SKILL.md | ef8fffc55b3dd3a858f092a21467403663f8394385d5bc13628a1f7520f8c939 | renamed; translated; design-canon name neutralised; the second-reviewer component named generically; repository name removed from the example |
| .claude/skills/izmerimo/SKILL.md | 7547911e5c6e4da9368979b48c60b80691cec170c2841390b6801477b9500f69 | skills/measured-values-report/SKILL.md | b5247fa2abf1851bc7164e8389e0530d25a13389afac9840d7fe49d74100b321 | renamed; translated; 'and antigravity' removed from the test description; the two original-only checkers marked as not carried; B-10 linked to defect-register |
| .claude/skills/dvoynik/SKILL.md | 000a4a568414cfb4ee502de5fa903f481f3625fa5223edad6273d4f70325d1eb | skills/reimplementation-check/SKILL.md | 6fd9f6b79a83178dad097c8d2ce42a7c50de2ac59ecbf511918015a21bdb598d | renamed; translated; function names in English; project name of the example code removed; the open case's file name removed (file not in either repository) |
| .claude/skills/dvoynik/izigran-sluchay.js | 21529d80750d781681f209c26e626dc9d67284b5de56b2054d84c7bf8301dcf6 | skills/reimplementation-check/worked-example.js | 9faf5d7cd674227c1f5ad1cec6990d5fef91ba48f6546b56301cda6261d299e1 | renamed; translated; Math.random() replaced by a seeded generator (mulberry32, seed 20260921); functions exported for tests; equivalence to the original on 10 inputs is a test |
| — | — | README.md | 7a6536ed22d0e752fbbac2f974e234a8490d0c205c3b9a62834555666abadb3f | new |
| — | — | skills.test.js | d699eed051e4cd40a66e1308e61593d7f36221e3c37093e71aa9764fe114e885 | new |
| — | — | evidence/2026-10-26/WORKED_EXAMPLE.txt | 55b420f5bbde4c46d9077087e188513d5ab01c8d66f8c570c34d3367194dce6f | new |

Not carried: `.claude/skills/nablyudatel/SKILL.md` (`49200023e1d14e38fa74402d5cb499d85a28d594dccc4e29053d2b2d4f216057`) — the owner's self-observation method from his book, outside this repository's scope.

Everything under `eval/` is new (the probe: plan, materials, prompts, answers, grading packets, grades, key, scorer, results); `eval/LOCK.txt` holds the pre-run hashes of the plan and materials. `evidence/2026-10-26/TESTS.txt` and `eval/` are produced after this table and is listed in the root `SHA256SUMS`.
