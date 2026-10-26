# Provenance — claim-audit-tools

Rule: originals are never modified. Every file here is a new copy; this table links each new file to the original it was made from.

Source: `OmniSlack/omniecho-core`, branch `claude/bro-6f3f37`, commit `848ae1a6264fb0cb31a99921a7fd569824e956ec` (2026-10-13), cloned read-only on 2026-10-26; the clone's working tree was checked clean afterwards (`git status --short` empty, HEAD unchanged). Original hashes are SHA-256 of the files at that commit.

| Original file | Original SHA-256 | New file | New SHA-256 | Change |
|---|---|---|---|---|
| verify/vid.js | 8570d23410ad7460e6a496e4479de3b22d05083c0ce11a31fa8bd228c05e09e6 | source-classification.js | c8652978fdb06d154e3a9d903ac7b45ec0b710537b2c007f409298a84a1a996b | renamed; comments, strings, output and identifiers in English; Bulgarian sign words removed from the patterns; self-test counts its checks |
| verify/nablyudenie.js | e067022799877d7a34da34fe0122e5d6478b9b59b4899f117fdc46376058f276 | observation-status.js | 7ae28b6a761ee66ca17b92597daad09d2e81d6939b9a6cf79584fa96ecbaeb34 | renamed; translated; the report check's inference-word list translated (because/through/via/by/from/model/formula/means); self-test counts its checks |
| verify/falsifikator.js | 324a717dd41166c480f44e66c548007b4410a7d891011c9131360607f72c1a75 | builder-vs-hunter.js | c9f16c2c910b506d97ad7b1224354a0683e721cfebce8cb2fbee8d76a07cdf9b | renamed; translated; Bulgarian universal-quantifier words removed (English ones kept); self-test summary fixed (ran 16, printed 11); DISPUTE-3 marker added |
| verify/pette.js | 3d69f0d2b97e6f155d73a36e9c68ca63cb9a285d4eadfebd5822898bf186e960 | open-hand-questions.js | c3ed8d926128649c26022445150d39d9ce1454d565f19bd1bf3bacb1926ea79a | renamed; translated; empty-answer pattern in English; DISPUTE-1 marker added; self-test counts its checks |
| verify/spor.js | 1709165daf6feb4849b7ac416f5c4af72869b9f629be635793f6d4a727b5161e | source-conflicts.js | 4e14413155220522266447b144b39aa9f3e597ba6aa102edc69088e94e9eacf1 | renamed; translated; checks markers in this folder instead of the original repository; summary counts disputes in HOLD (was 'all in HOLD' with one decided); self-test summary fixed (ran 9, printed 8) |
| verify/mutaciya.js | a20e2fcfe2d82eeebf7d05251dc1e7a5492a67dba395fcb7066113cde0dd097c | claim-mutation.js | a8141615a240127e21ea61c1b520d0dc5b1034c6d6568e57aa5208aa65ace12d | renamed; translated; Bulgarian ladder words removed; no-argument crash fixed (ReferenceError: __doc__); one self-test added for that path |
| verify/text.js | d02f6ff1a006db965d115bcb8779043b741401edaace2594781dcbe3c2894e11 | overclaim-scanner.js | fb5ba4ddb12fa9b73aaf70b6ef7c8f12667384b46cb83a53b2e5a7089f26e946 | renamed; Bulgarian comments and pattern alternatives removed or translated; CLI wrapped in main() and analyse() exported for tests |
| verify/claims.js | b54710d2485e79d64aa7717cf9005f9794da3ce0ca5489d11dc20d7250c6e9c1 | claims-register.js | ae114b92dfdc4df1e17a20ee6dd0f8809f753b36815eb6c23704a2205ee4c0e8 | renamed; technical entries kept, biographical and non-technical entries removed; Bulgarian patterns removed; default targets read from the git repository in the current directory; by-name exemptions of the original repository not carried |
| verify/journal.js | 0f5c92466d97d2b32893e992479c725db7bf379d18696b30c5a66d6d9f04646b | action-journal.js | 9e63500bb16d69e7d6baffd02e2bf7d886cdaf96d628002352d2be2e1edd232a | renamed; two quoted requirements translated; journal file in the current directory or JOURNAL_FILE (was the repository root) |
| verify/canary.js | 24ac7bbb801d96de17d82131f4bb7e60802535108f5402f1d2ace0b177755639 | copy-canary.js | 7a1e31516f8ee4f0a365ae2a4c1d5d8c6be9464beff6704067f4e5a3640d3e98 | renamed; ledger in the current directory or CANARY_LEDGER (was the repository root) |
| verify/tost.py | 1c8eb5978188512a8345bd5a1df3cf07018350afe693e5b5ba534c8b62300442 | equivalence-tost.py | 2c48f2a34c30273cad5b3cfd61605e21e5f9a2a7b7cb6906b2ec21d7b9448ff0 | renamed; docstring, messages and table labels in English; arithmetic unchanged |
| verify/timeline.py | 03d62a5f2ca77cd145c229d77c4aa97126b2b8e077f034b0763c8146e9caab89 | earliest-mention.py | be0a28a4bbc5b3c0f2709168a65eeb2c257204ec673c5ef60607fe18537da768 | renamed; default term list replaced by a neutral placeholder (was the owner's project vocabulary); otherwise unchanged |
| verify/colab.py | 5903bfe76fb9eb135cf2262946b10b706f199e1c938805db5fbe483e43045040 | overclaim-audit-colab.py | a60bd131c3651aa4000c9034a7f8dbfdeba34a869183f9d593e848665e6221f3 | renamed; Bulgarian pattern alternatives removed; docstring corrected (promised a date search it never contained) |
| probe6.test.js (repository root, U1–U6) | 02c8997ef2d5575b61a5ba4802903720e23f4bf411a6ec7b760f6369c0fc39c8 | overclaim-scanner.test.js (U1–U6) | 601fbf8ce903ea168d727851285ba64aa0e4ce6e9394af0cb4f3d280d8cf0922 | translated; points at overclaim-scanner.js; Bulgarian declaration phrase replaced by the English one the scanner recognises; a book-title file name in U3/U4 replaced by a neutral one; negative-check comment corrected; assertions unchanged |
| probe4.test.js (repository root, S6–S7 only; S1–S5 test the evaluator and are not carried here) | 42c70acaedbbda2cec216d3c46bbaf6c9d8c1310c81d840ad1934680d3b3842f | overclaim-scanner.test.js (S6–S7) | (same file) | translated; control characters written as escapes instead of raw bytes; S7 also asserts that the line is still flagged |
| — | — | README.md | ab68919aaa0802d385cd6bc84af0f59eb6b2b3c93994799550f84c63ff1d30ba | new |
| — | — | tests.test.js | e61c1a42e76029c673d05817646d61c09b9bc26d4f1a984ebe3c64faafcebb1c | new |
| — | — | samples/overclaim-sample.md | 0bbff9af36ff6051b605743cc946df95ca5ec27db74fd5ce01862d027df04d01 | new |
| — | — | samples/claims-sample.md | 6f843803891fdccd46571120a709f0a4ea2273fd89291eafb53de646e870d585 | new |
| — | — | samples/claims-clean.md | 3fc1807bf80f040aed5a7f194568b3686d699aca4cd252080d7a00881433594a | new |
| — | — | samples/tost-sample.csv | 68099ac851d4d35983c7e771dfb4eadbdd7ef0eccb333ab284d58bbd86a0e757 | new |
| — | — | samples/archives/conversations.json | d6a8cd1c7ada9d3ac68ba8a832e9f0efa98fc6a791dc462b0bcc33f8cc4fe07a | new |
| — | — | samples/archives/mail.mbox | b44e8ce0485944868fb6a810a953f0c8478dc8eab18032b54c8b5d42e451adfb | new |
| — | — | samples/source-conflicts/drift-observer-note.md | a6fb26639d4b8dd9256bf9f223bf620ab9fff4f73110f7672ebb1ef6f8b19912 | new |
| — | — | evidence/2026-10-26/equivalence-check.js | 59a9321828250eedecaad3f152d0cea45419bad11a6175c0ca35081e4af270ad | new |
| — | — | evidence/2026-10-26/BASELINE.txt | bc1d87275a03846bd2fd014864cbcc579661455cc334b8cb1d2ea9dee1849bed | new |
| — | — | evidence/2026-10-26/AFTER.txt | 787853f7eb7bff81ea08e174afd554fc087aedf8429c432921e61c9c96bfa622 | new |
| — | — | evidence/2026-10-26/TESTS.txt | 401a0c5d94bd62aac3bcde138cab91be6215e41983197edc1ed5f654c62506ca | new |
| — | — | evidence/2026-10-26/ENVIRONMENT.txt | c0a00831769b15dff2f0e14822d3d69f21bd74355b25f78b4c34bc4b65f16622 | new |

Equivalence of behaviour is shown in `evidence/2026-10-26/TESTS.txt` (22 of 22 comparisons equivalent) and the 30 tests, including the negative check of the carried transcript tests. The README hash above is of README.md as committed; PROVENANCE.md itself is listed in the repository's root `SHA256SUMS`.
