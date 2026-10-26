# evidence-retriever

**Kind:** tool (PowerShell, no dependencies) · **Status:** prototype, read-only · **Date:** 2026-08-03 (v0.1) · 2026-10-26 (v0.2)

## Purpose

A local, read-only search over a folder of Markdown research notes that returns, for every hit, the exact file, line and section, the confidence marker and mode words written **on that line**, the URLs on that line, and the text — so a claim can be traced to its address instead of being remembered. It does not infer truth, confidence or intent; it reports only what is explicitly written on the matched line.

## How it works

1. Collects the Markdown files under `-Root` whose name contains `CANDIDATE` (the default filter of the original project; change the `-Filter` on line 143 for another corpus).
2. Splits the query into terms; scores each line by all-terms-on-line, exact phrase, title/section position and an explicit marker on the line (`Get-Score`).
3. Extracts per line: confidence marker (🟢 🟡 🟠 🔴 🔵 ⚪, built from Unicode code points so the file stays parseable under Windows PowerShell 5.1), mode words (`source`, `search`, `inference`, `gap`, …), signal words for gap/contradiction/limit language, and URLs.
4. Returns the top `-MaxResults` as `Table` (default), `Json` or `Markdown`. A query with no hits is reported as "no explicit match; absence is not established" — a search result is not evidence that a concept is absent.

## How to run

```powershell
pwsh -NoProfile -File evidence_retriever.ps1 "prompt injection" -Root ./sample -Format Json -MaxResults 5
pwsh -NoProfile -File run_checks.ps1          # 7 checks on ./sample
```

`sample/` holds two small synthetic Markdown files so the tool can be run without private documents. They are test fixtures, not research.

## Evidence

| Claim | Command / source | Observed |
|---|---|---|
| Original validation, Run 002 (Windows PowerShell 5.1, 15 files): two runtime defects found and fixed, then 5 tests passed; source manifest SHA-256 unchanged | original record of 2026-08-03, section "Validation Run 002" | **Reported** (text of the record, not re-run on 5.1) |
| Same five-point matrix on PowerShell 7.6.9 / Linux, 26 original files | runs of 2026-10-26 | **Reproduced**: `prompt injection` → 5 results with file/line/section; `quantum` → 3 results with the 🟢 source line and URL; nonexistent query → 0 results; plain `grep -F` baseline 4 lines; SHA-256 of the 26 files identical before and after |
| Renaming and the D2 fix did not change results for queries with matches | 5 queries over the 26 original files, JSON output of original vs v0.2 compared byte for byte | identical |
| Check script on the synthetic sample | `pwsh -NoProfile -File run_checks.ps1` | `PASS` ×7 (6 behaviour checks + D2 stays fixed), exit 0 |

The two runtime defects of the original record, kept here as the tool's history:
1. First run **FAIL** — UTF-8 without BOM was read as ANSI by Windows PowerShell 5.1; the parser stopped on broken Unicode literals.
2. Second run **FAIL** — `$PSScriptRoot` was empty while the default parameter expression was evaluated.
Fix: ASCII-safe source, emoji markers built from code points, default root resolved after parameter binding. Neither defect touched a source file.

## Defects found in this repository (2026-10-26, PowerShell 7.6.9)

| # | Finding | Status |
|---|---|---|
| D2 | `-Format Json` with no match printed nothing instead of `[]`: an empty collection piped into `ConvertTo-Json` yields no objects. Reproduced on the original under a terminal as well. | **Fixed in v0.2** (one line: `ConvertTo-Json -InputObject @($selected)`); `run_checks.ps1` fails if it returns |
| D1 | First reported as "`-Format Table` with no match prints nothing when stdout is redirected". **Retracted the same day:** in the Linux sandbox PowerShell's formatter writes nothing to a non-terminal stdout for *any* object (`Get-Date \| Format-List` included); under a pseudo-terminal the original script prints the boundary object correctly, `break` or not. The symptom was the environment, not the script. Kept here so the correction is on record. | not a defect |

`-Format Markdown` reports the no-match case correctly in every run.

## Limitations

- Traceability, not relevance or truth: the improvement over plain text search is the address and the line-level markers, nothing more.
- Confidence/mode/gap/contradiction are read only from the matched line; nothing is inherited from the surrounding paragraph.
- No embeddings, no semantic retrieval, no URL verification, no source-independence scoring.
- Windows PowerShell 5.1 compatibility (the reason for the ASCII-safe source) could not be re-verified here; only PowerShell 7.6 on Linux was available.
- Reads only; writes nothing; sends nothing (checked: no write or network cmdlets in the script).

## Provenance

See [`PROVENANCE.md`](PROVENANCE.md). The script is the 2026-08-03 original with a rewritten header comment, one output title changed, and the one-line D2 fix (v0.2); every other line of the search logic is identical to the original (`diff` shows exactly those two changes). `run_checks.ps1` and `sample/` are new files written for this repository.

## Contribution

- Martin Urumov: the requirement that every retrieved claim carry its exact address and that "no result" must never be reported as "absent"; the read-only boundary; caught the two runtime defects of 2026-08-03 (encoding, empty `$PSScriptRoot`); acceptance of the prototype only after the failing runs were recorded, not removed; the decision to fix D2 in this copy.
- AI coding assistants: implementation and the 2026-08-03 corrections; in this repository the check script, the sample corpus, the D2 finding and fix, and the mistaken D1 report with its retraction.
