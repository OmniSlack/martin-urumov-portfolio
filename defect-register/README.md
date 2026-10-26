# defect-register

**Kind:** data + small library (JSON, Node.js ≥ 18, zero dependencies) · **Status:** a record, not a tool that judges; self-reported attribution · **Date:** entries 2026-07-21 → 2026-10-13; English edition 2026-10-26

## Purpose

A register of **forms of failure**, not of individual mistakes: 165 recorded cases, each with the form it took, how it was found, who found it, and the family it belongs to (22 families). It was kept while building the evaluator in [`ai-proposal-evaluator`](../ai-proposal-evaluator/) and its tooling, and it was used actively: every new case was compared against it, with two questions — *what does not fit the clean flow?* and *what does fit a known error?*

A claim is one-off; a form comes back. "19 gates" was wrong once; "the highest number read as a count" came back three times, with different numbers. The register exists so that the second and third time are recognised as the first.

The entries are written **in the first person by the AI assistant about its own errors** ("I counted…", "I declared…"); Martin Urumov is "he". The M- entries are his own errors, recorded at his request.

## How it works

- `register.json` — 165 entries: `id`, `found_by` (`human` | `instrument`), `date`, `family`, `what`, `form`, `how_found`, and where present `detector`, `authorship`, `split`.
- `families.json` — 22 families: `key`, `name`, `form`, `why_it_returns`, and for five of them `how_caught` and `origin`. Four families are defined with no case yet (they come from Martin's own list of failure modes and are kept on purpose).
- `register.js` — the helpers of the original, ported:
  - `compare(text)` runs the five machine-detectable forms against a new text or code (highest number read as a count; `\b` around Cyrillic; presence of a permit checked instead of its content; naive summation against a limit; a generator that reads the repository and writes to it). A matching exception from `filters.js` **marks** a finding; it never silences it.
  - `byFamily()`, `oldNew()` (before / from 2026-09-20, with a coverage check so no entry can fall between buckets — defect B-103), `openHand()` — Martin's metric A / (A + B) (A = caught by the instrument on its own, B = caught by the human) against his threshold 0.67.
- `confidence-scale.js`, `filters.js` — the parts of the original honesty scale and exception list that `register.js` uses.

Id prefixes: `P-` errors before the repository (July 2026, CV texts) · `#` numbered defects of the evaluator code, as in its README · `M-` Martin's own errors, recorded at his request · `B-` the running series from 19 September 2026 (the meaning of the letter is not stated in the source).

## How to run

```bash
node --test                       # 21 tests
node register.js                  # the whole register, then old/new and the open-hand numbers
node register.js --families       # families, largest first, with their cases
node register.js --compare FILE   # check a new file against the known forms (exit 1 if any occurs)
node stats.js                     # counts by finder, family, date, id prefix
```

## Evidence

| Claim | Command | Observed 2026-10-26 (Node v22) |
|---|---|---|
| 165 entries, ids unique and in the original order | `node --test` | pass |
| 51 found by the human, 114 by the instrument, entry by entry as in the original | `node --test` | pass |
| 22 families, every entry's family and detector identical to the original | `node --test` | pass |
| `openHand`, `oldNew`, `byFamily` and `compare` (9 inputs, Bulgarian text and code) return exactly what the original helpers return | `node --test` against `fixtures/original-helper-outputs.json`, produced by running the original `verify/greshki.js` unmodified | pass |
| `compare()` returns the recorded family for reproductions of #7, #16, #18, #21, #22, #24 and B-6 | `node --test` | pass |
| Open hand 114 / 165 = 0.6909, above 0.67; without the M- entries 105 / 155 = 0.6774 | `node register.js` | as stated — **self-reported**, see Limitations |
| 105 of 165 entries (63.6 %) are from one day, 2026-09-20; 12 distinct days in all | `node stats.js` | as stated |
| No Cyrillic in the folder | `evidence/2026-10-26/VALIDATION.txt` | 0 characters |

## Limitations

- **`found_by` is self-reported.** The same assistant that made most of the errors also labelled who found them. The original has a socket for an independent second classification (`vtora-ruka.json`), and it is **empty** — 0 of 165 entries classified from outside. Without it the 0.69 is a self-report with a scale (B-133 says this about itself).
- **Authorship is marked on 1 of 165 entries** (B-139: joint, with the split stated). `found_by` says who *found* a defect, not who designed the fix.
- **The register remembers; it does not think.** It can stop a known form from coming back; it cannot see a new kind of failure. `compare()` covers only five machine-detectable forms; the rest are recognised by a reader.
- **Most entries come from a few days:** 12 distinct days, 105 entries from 2026-09-20 alone, 133 from 20–21 September. "Trajectory across sessions" is not measurable from this data (B-136).
- The open-hand threshold and the A/B split are Martin's design; the number moves with the length of the register more than with behaviour (B-135, B-136). The growth rule is on hold by his decision.
- Translation: the entries were translated from Bulgarian in full; commands, paths, code and numbers are verbatim. Words that are Bulgarian in the code or the conversation (file names such as `komandi.js`, field names such as `kak_namerena`) are kept as they are, with a gloss where the meaning matters. Two entries had personal health details, which are generalised and marked "[… omitted in this translation]" (B-128, B-137). In seven fields, the owner's internal project names were replaced by what they refer to (the working-rules document, the authority-boundary design specification) and the title of the owner's book by "the owner's book manuscript" (entries M-7, B-14, B-53, B-60, B-74, B-133, B-135), to keep creative work out of this repository. Repository and file identifiers (`omniecho-core`, `omniecho-81.bundle`) are kept: they are the names of the actual objects.
- References to files (`verify/…`, `core.js`) point into the source repository, which is private; they are not in this folder.

## Provenance

See [`PROVENANCE.md`](PROVENANCE.md). Source: `verify/greshki.js` with `verify/cedki.js` and `verify/znaci.js`, OmniSlack/omniecho-core at commit `848ae1a` (2026-10-13). The original is a single 333 KB Bulgarian JavaScript file holding data and code together; here the data is JSON and the code is a separate module.

## Contribution

- Martin Urumov: found 51 of the 165 recorded defects (as recorded — self-reported, see Limitations); set the use of the register — compare every new case against it, ask what does not fit the clean flow and what fits the known errors; asked for the register in the first place ("this is not a defect, it is data collection, it is experience"); asked for his own errors to be recorded too (the M- entries); defined the open-hand metric and its 0.67 threshold, the five failure modes of his Section 9 that became families, and the decisions recorded in the entries.
- AI assistants: found 114 of the 165 (as recorded); wrote the entries, the code and the detectors; produced this English edition, the port, the tests and the equivalence fixture.
