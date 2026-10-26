# document-claim-checker

**Kind:** tool (Python 3, standard library only) · **Status:** working; read-only; no network · **Date:** original 2026-09-16; English copy with one fix 2026-10-26

## Purpose

Documents about software make claims about files: "this file has this SHA-256", "see `module.py:40`", "77 tests pass". This tool reads a Markdown document and checks each claim against the files on disk. It never trusts the document — a document does not prove itself.

## How it works

It extracts three kinds of claim from each line and gives each one of five statuses, which are never merged:

| Status | Meaning |
|---|---|
| `VERIFIED` | checked, and true (the digest matches the named file) |
| `FAILED` | checked, and false — only when the pairing is unambiguous: one digest, one named file, found |
| `REF_IN_RANGE` | a `file:line` reference points to a line that exists; what the document says *about* that line is not checked |
| `MALFORMED` | the document cannot be checked as written: no file name, an ambiguous name, a missing file, a path that does not exist, two digests on one line. Fixable in the document |
| `UNCHECKABLE` | a test count. A document saying tests pass is not evidence that they pass; only running them is |

A wrong `FAILED` costs more than an honest "cannot tell", so on any ambiguity the answer is `MALFORMED`, not a guess.

File lookup: a bare name (`report.txt`) may be found anywhere under `--root`, if exactly one file has that name. A name with a directory (`docs/report.txt`, `../x.txt`) is a statement about that location: the file is there, or the claim is `MALFORMED`. Nothing outside `--root` is read.

## How to run

```bash
python3 document_claim_checker.py --root <dir> DOC.md [DOC2.md ...]
python3 document_claim_checker.py --root . --json report.json --strict MANIFEST.md
python3 -m unittest test_document_claim_checker -v        # 15 tests
python3 tools/compare_with_original.py <original claim_check_fixed.py>
```

Exit codes: `0` no `FAILED`; `1` at least one `FAILED` (with `--strict` also any `MALFORMED`); `2` a document given on the command line does not exist.

## Evidence

| Claim | Command | Observed 2026-10-26 (Python 3.13) |
|---|---|---|
| 15/15 tests: the six fixes listed in the original handoff, the 2026-10-26 fix, test counts, exit codes, JSON report, read-only | `python3 -m unittest test_document_claim_checker -v` | 15 pass ([`TESTS.txt`](evidence/2026-10-26/TESTS.txt)) |
| The copy behaves exactly like the original wherever the fix does not apply | `tools/compare_with_original.py`, part 1: 400 generated lines, 397 claims | identical statuses (227 / 112 / 19 / 39) and the same exit code |
| The fix changes exactly the three cases it is for | same, part 2 | original `VERIFIED` / `FAILED` / `FAILED` → copy `MALFORMED` ×3 |
| The original verifies its own handoff manifest | original tool on `MANIFEST.sha256` of the 2026-09-16 handoff | 7/7 `VERIFIED` |

## Defect history

| Date | Defect | Found by | Proof |
|---|---|---|---|
| before 2026-09-16 | Six defects in the earlier version, fixed in the 2026-09-16 version: the digest was paired with the first file name on a line, not the one it belonged to (false `FAILED`); a path check by string prefix let files outside the root be read; a `file:line` reference that merely existed was reported `VERIFIED`; "missing" and "ambiguous" gave the same message; the file tree was walked again for every claim; files without an extension (`Dockerfile`) were invisible | recorded in the 2026-09-16 handoff (an AI review); the `Dockerfile` case was found in real use | each one has a test in `FixesInTheHandoff`. **The earlier version itself is not available**, so the defects are shown fixed, not reproduced |
| 2026-10-26 | **A path was matched by its file name somewhere else.** When the named path did not exist, the lookup fell back to the base name: `archive/report.txt` (missing) was reported `VERIFIED` against `docs/report.txt`; `../outside.txt` (outside the root, correctly not read) was reported `FAILED` against a different `other/outside.txt`. Also, a line with two names, one missing, could give `FAILED` against the other. **Fixed:** the base-name fallback applies only to bare names, and `FAILED` needs every name on the line to resolve | AI assistant, 2026-10-26, while testing this copy | `PathsAreStatementsAboutLocation` (5 tests); comparison part 2 |

## Limitations

- `REF_IN_RANGE` checks only that a line exists. Whether the document describes that line correctly is not checked.
- Only SHA-256 digests, `` `file:line` `` references and test counts are recognised. Other claims (dates, version numbers, prose) are not seen at all — a clean report does not mean the document is true.
- File names are found by pattern. A name the pattern does not recognise is invisible; the extensionless list is closed on purpose.
- Test counts are recognised in English only (the original also matched the Bulgarian word for tests).
- The tool reports; it does not fix documents.

## Provenance

See [`PROVENANCE.md`](PROVENANCE.md). Source: `claim_check_fixed.py` from `omniecho_handoff_2026-09-16.zip`. The handoff's other files are not carried here: the alternative sidecar and its gap tests are already in [`payload-policy-validator/reference/`](../payload-policy-validator/reference/), and the hardened Docker files belong to a different repository.

## Contribution

- Martin Urumov: the requirement behind the tool — a document is not evidence of itself; "PASS" without a raw log or a number is a claim; a test count is checked only by running the tests again.
- AI assistants: the implementation and the 2026-09-16 fixes; this English copy, the 2026-10-26 defect and fix, the 15 tests and the comparison tool.
