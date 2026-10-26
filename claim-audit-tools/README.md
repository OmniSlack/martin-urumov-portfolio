# claim-audit-tools

**Kind:** thirteen small tools (Node.js ≥ 20 and Python 3, standard library only, no network) · **Status:** working tools; English copies of instruments from the evaluator project, verified equivalent to the originals · **Date:** originals 2026-09-18 → 2026-09-20 (unchanged through 2026-10-13); English copy, two fixes and the tests 2026-10-26

## Purpose

Tools for checking **claims** rather than code: where a claim came from, how it is known, whether anyone looked for what would refute it, whether a later version quietly says more than the earlier one, whether a document carries more confidence than its evidence, and whether a retracted number is still in circulation. Each one turns a rule that used to live in prose ("repetition is not corroboration", "an empty answer means *not looked at*", "a file is a source for what was said, not for what is true") into something that runs and returns a decision.

Six of them implement sections of the authority-boundary design specification v0.1 (§4, §5, §6, §7, §18, plus the §19/§23 rule on disputes). The rest are the project's practical instruments: an over-claiming scanner, a register of retracted claims, an append-only action journal, copy markers, an equivalence test and an earliest-mention search.

## How it works

| Tool | Takes | Returns |
|---|---|---|
| `source-classification.js` (§4) | a description of a source (path, file name, sentence) | one of six kinds — CURRENT INSTRUCTION, PRIMARY, DERIVED, HISTORICAL, MODEL INFERENCE, UNKNOWN — and whether it may instruct. Only an explicitly declared current instruction may; text that calls itself an instruction gets no authority; no recognisable sign → UNKNOWN, never PRIMARY |
| `observation-status.js` (§5) | a claim with its observation / named inference / what would resolve it | DIRECTLY OBSERVED, INFERRED, UNSUPPORTED or UNKNOWN; a report check flags an inference that names no model and an UNKNOWN with no real path to resolution |
| `builder-vs-hunter.js` (§6) | evidence for (A), evidence against (B), whether refutation was attempted and how | SUPPORTED, CONTRADICTED, AMBIGUOUS (with the boundary named) or INSUFFICIENT EVIDENCE. Refutation not attempted → never SUPPORTED. A counter-example refutes a universal claim and only bounds an existential one. No outcome carries authority |
| `open-hand-questions.js` (§7) | a model and answers to five questions (support, disproof, what else fits, hidden assumption, what remains unknown) | which questions were not looked at; "nothing", "—", "n/a" count as not looked at; the fifth may never be "nothing" |
| `source-conflicts.js` (§19, §23) | its register of disputes between two sources of equal standing | the disputes, held rather than resolved; exit 1 if a disputed name is used in a file without the dispute's id (silent selection of the convenient source) |
| `claim-mutation.js` (§18) | two versions of one claim | the axes (certainty, scope, causality, conditions, negation, time) on which the newer one is stronger; exit 1 if anything was strengthened; lowering is never an alarm |
| `overclaim-scanner.js` | a text file or stdin | lines with a number and no source, an unnamed authority, an unenforced absolute, a priority claim, a measurement of one's own body with no instrument, a "skip the step" word; uniform confidence across a long text; restated sentences — each with a rewrite at the strength the evidence supports. Control sequences in the scanned text are neutralised |
| `overclaim-audit-colab.py` | a file or folder (.txt .md .html .docx) | the same rule families for Python/Colab, plus "metaphor presented as mechanism" |
| `claims-register.js` | `--check` and document paths (or every tracked text file of the git repository in the current directory) | every retracted or quarantined claim still present, with what to say instead; exit 1 if any. A retraction quoting the old number is not flagged |
| `action-journal.js` | `open` / `add` / `seal` / `check` / `show` | an append-only hash chain with an open and a seal marker; `check` names the first altered or missing entry and says when completeness is not established |
| `copy-canary.js` | `mint <document> <recipient>` / `check <file>` / `list` | a per-copy marker and its ledger; `check` says which copy a text came from, and says that absence of a marker is not evidence |
| `equivalence-tost.py` | a CSV with a two-level `condition` column and numeric columns, a margin Δ | two one-sided tests per column; shows where "difference inside the margin" and "equivalent" disagree |
| `earliest-mention.py` | a folder of `conversations.json` exports and `.mbox` mail, `--terms=` | the earliest dated occurrence of each term, labelled server-stamped (mail Date header) or self-reported (export field) |

## How to run

```bash
node --test                                   # 30 tests: each tool's main decision on samples/, all self-tests,
                                              # and the 8 scanner tests carried from the evaluator project
node source-classification.js --selftest      # the same for observation-status, builder-vs-hunter,
                                              # open-hand-questions, source-conflicts, claim-mutation
node claim-mutation.js "this may hold in some cases" "this proves it holds in all cases"
node overclaim-scanner.js samples/overclaim-sample.md
node claims-register.js --check samples/claims-sample.md
JOURNAL_FILE=/tmp/j.jsonl node action-journal.js open "why"
python3 equivalence-tost.py samples/tost-sample.csv --margin 5
python3 earliest-mention.py samples/archives --terms=observer,HOLD
python3 overclaim-audit-colab.py samples/overclaim-sample.md
```

No dependencies, no network. `action-journal.js` and `copy-canary.js` write one file each, in the current directory or where `JOURNAL_FILE` / `CANARY_LEDGER` point. The words `curl` and `http` inside the two scanners are patterns they look for in text, not calls.

## Evidence

| Claim | Command | Observed 2026-10-26 (Node v22.23.4, Python 3.13.17) |
|---|---|---|
| The English tools decide exactly as the originals on the same English inputs | `node evidence/2026-10-26/equivalence-check.js <copy of the original repository at 848ae1a>` | **22 equivalent, 0 different** — 12 source descriptions, 6 claim statuses, 12 dual-observer cases, 7 answer sets, 11 claim pairs; byte-identical output (after removing paths, times, digests) for the scanner, the Colab audit, the earliest-mention search, the journal (including tamper detection) and the canary; identical TOST numbers; same flagged lines in the claims check |
| Tests pass | `node --test` | **30 / 30** — 22 in `tests.test.js`, 8 in `overclaim-scanner.test.js` |
| The 8 scanner tests carried from the evaluator project (transcript exemption U1–U6 with their mirror cases; control sequences S6–S7) keep their strength | negative check: remove the transcript exemption from the scanner | U1 fails; remove also the restated-line exemption and U3 fails — the same result as on the original scanner and tests |
| Self-tests | `node <tool> --selftest`, `python3 equivalence-tost.py --selftest` | 11, 11, 16, 11, 9, 13 checks, all passing; TOST 5 pass / 0 fail |
| Originals before any change | `evidence/2026-10-26/BASELINE.txt` | every command, exit code and check count of the unmodified tools; the one crash is recorded there |

`AFTER.txt` holds the full output of every English tool; `TESTS.txt` the test and equivalence runs; `ENVIRONMENT.txt` the versions.

## Defect history

| Date | What | Proof |
|---|---|---|
| found 2026-10-26 | **`claim-mutation` crashed when called without arguments**: the usage path called `console.log(__doc__ || …)`, a Python idiom; in JavaScript `__doc__` is undeclared, so it threw `ReferenceError` instead of printing usage. **Fixed**: a `USAGE` string, exit 2. | BASELINE.txt (exit 1, ReferenceError); test *claim-mutation: the no-argument path prints usage and exits 2* |
| found 2026-10-26 | **Two self-tests printed a hard-coded, wrong check count.** The dual-observer self-test ran 16 checks and printed "11 checks"; the disputes self-test ran 9 and printed "8". A summary line that does not count is a claim without a source — the shape these tools exist to catch. **Fixed**: every self-test now counts the checks it actually ran. | BASELINE.txt vs AFTER.txt |
| found 2026-10-26 | **The disputes summary said "all in HOLD"** while dispute 1 had been decided by the owner. **Fixed**: the summary counts the disputes in HOLD (2 of 3). | BASELINE.txt vs AFTER.txt |
| found 2026-10-26 | **A test comment overstated its own negative check.** The original transcript tests said that removing one exemption line makes U1, U3 and U5 fail. Re-run on the original: only U1 fails; U3 needs a second line removed; U5 guards the other direction and cannot fail that way. **Fixed** in the comment. | `overclaim-scanner.test.js` header |
| found 2026-10-26 | **The Colab audit's docstring promised "the earliest-date search from timeline.py"**, which the file never contained. **Fixed** in the docstring; the search is `earliest-mention.py`. | `overclaim-audit-colab.py` header |

All five were found by the AI assistant while preparing this folder. The originals' own recorded history (the over-flagging fixes of the scanner and the register, the transcript exemption, the escape-sequence defect, the existential-vs-universal fix in the dual observer) is kept in the comments of each file.

## Limitations

- **English input only.** The originals also matched Bulgarian equivalents of each pattern — including the transcript declaration phrase, which the original recognised in both languages; those alternatives were removed with the translation, so no Bulgarian detection data is kept and the carried transcript tests use the English phrase `TRANSCRIPT OF A MACHINE RECORD`. Two vocabulary lists were translated rather than dropped, which can change results on English text that the originals would not have matched: the scanner's units (`times`, `points`) and source words (`according to`), its confidence-marker names (`Established`, `Probable`, `Hypothesis`, `Metaphor`, `Unverified`), and the observation report's list of words that name an inference (`because`, `through`, `via`, `by`, `from`, `model`, `formula`, `means`).
- These tools judge the **form** of a claim, never its truth. A perfectly sourced sentence can be false; `claim-mutation` cannot see a change in what the subject means; `source-classification` classifies by name and description, not by content.
- `claims-register.js` carries the technical entries of the original register only. Its biographical entries and entries about the owner's non-technical writing were removed as personal; the original's by-name exemptions for one prompt file and two generated folders were specific to that repository and were not carried.
- `source-conflicts.js` holds the three disputes of the original project; the files it checks for markers are two tools in this folder and one sample. In another project its register would be that project's own.
- `overclaim-audit-colab.py` is the older port: it has no transcript exemption, so it flags record fields that `overclaim-scanner.js` exempts (4 against 2 number findings on the sample).
- `earliest-mention.py`'s default term list is a neutral placeholder; real use needs `--terms=`. A term not found is not evidence that it did not exist — only that it is not in the archives supplied.
- `action-journal.js` shows that entries were not changed after writing, not that they are true; a whole-file rewrite is detectable only if the head digest was kept elsewhere.
- Example data inside the tools (test counts, a gate's name, commands such as `node verify/all.js`) refer to the original evaluator project and are illustrations, not claims about this repository.

## Provenance

See [`PROVENANCE.md`](PROVENANCE.md). Source: `OmniSlack/omniecho-core`, branch `claude/bro-6f3f37`, commit `848ae1a6264fb0cb31a99921a7fd569824e956ec` (2026-10-13), folder `verify/`. Every file renamed by function; comments, strings and output translated into English; identifiers translated; brand names and personal provenance lines replaced by neutral wording; the fixes above. `samples/`, `tests.test.js` and `evidence/` are new; `overclaim-scanner.test.js` is the English copy of `probe6.test.js` (U1–U6) and of tests S6–S7 of `probe4.test.js` from the repository root.

## Contribution

- Martin Urumov: the requirements behind each tool — the specification sections they implement (source content is not instruction authority; observation versus inference versus unknown; builder against hunter, and agreement creates no authority; the five open-hand questions; claim mutation; disputes held, not resolved), "repetition is not corroboration", the honesty/confidence scale the scanners read, "read it to the end before claiming", the quarantine status of the claim register, "a report for every action" and the forbidden-marker bookends of the journal; the decision on the open-hand dispute ("it is a FUNCTION").
- AI assistants: the implementation of all thirteen tools and their self-tests (2026-09-18 → 2026-09-20), the English translation, the samples, the 22 new tests and the translation of the 8 carried ones, the equivalence check against the originals, and the five defects found and fixed on 2026-10-26.
