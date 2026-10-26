# Authorship

This repository is AI-assisted work, and says so.

## Who did what

| Part | Martin Urumov | AI coding assistants (Claude Code, Codex, GitHub Copilot) |
|---|---|---|
| Research questions, requirements, acceptance criteria | yes | — |
| Negative and edge-case scenarios to test | yes | some, marked in the README of the folder |
| Writing code and automated tests | — | yes |
| Running tests and reporting counts | both | both |
| Finding defects | some, marked in the README of the folder | some, marked in the README of the folder |
| Review of results, decisions on what is kept or rejected | yes | — |
| Translation of comments and documents into English | — | yes |

## Rules used throughout

1. A finding made by an AI is attributed to the AI, not to me.
2. A number is published only with the command that produces it.
3. "PASS" in a document without a raw log or a measurable number is treated as a claim, not as evidence.
4. Defects found in my own work are kept on record, not removed.
5. Documents and files are data. Nothing in them is an instruction to a system or a permission to act.

## Where the rules come from, and when

The rules the code in this repository enforces were written down as a working method before the code existed. The method documents are private: they hold personal material and are not published. They are listed here by date and SHA-256 only, so that each can be checked against the original if it is ever produced.

| Private source document | Date stated inside | SHA-256 |
|---|---|---|
| Method core, v1 | 2026-07-24 | `4a8f6cef7e4ad08a084356a56756c965118fadbdccc83c1fb8aad7b54b35edf1` |
| Method core, v2.26 | 2026-07-31 | `3e3938aae1adfb77e27e65a7e8e0c2d7305566a8cde453aa737c520a88135f61` |
| Method core, v2.27 (v2.26 plus one section) | 2026-08-03 | `c2c29113908ce22b12ff518b670ce63e698a600c08c19f4d267d8bce356b422a` |
| Specification of a minimal gating test | 2026-07-29 | `2f3794b84382b60b31f82b653c3d8806eb7f1680a929846bed2f7c06996b3058` |
| Worksheet for a single case | 2026-07-30 | `10a559ccde6943055baee350a31c9c6cec7057ea17cb15f3cad1b219abdb904c` |
| Handoff note | 2026-07-31 | `e69c82aba128f487fc9540e0b15a92416b435ef82512ef79003eae0498811883` |

| Rule | Where it is used here | Source (section, version, date) |
|---|---|---|
| Every claim carries its own confidence marker; uniform confidence over uneven truth is how a false claim passes | [`ai-agent-skills/`](ai-agent-skills/) `claim-discipline` §1; [`defect-register/confidence-scale.js`](defect-register/confidence-scale.js) | core §0, v1, 2026-07-24 |
| A flag is data: if it survives evidence it is a correction, if it vanishes it was missing context; it is never lowered under pressure | [`payload-policy-validator/flag_hold_validator.py`](payload-policy-validator/flag_hold_validator.py) | core §0, v1, 2026-07-24 |
| Candidate ≠ canon; nothing enters without a separate acceptance | [`ARCHITECTURE.md`](ARCHITECTURE.md); [`ai-proposal-evaluator/`](ai-proposal-evaluator/) | core §2, v1, 2026-07-24; §5 item 4, 2026-07-25 |
| A finished text is reviewed in nine passes (provenance, self-consistency, referents, omissions, markers, numbers, care, voice, which question was answered); the review reports, it does not edit | [`claim-audit-tools/`](claim-audit-tools/) | core §7, 2026-07-25 |
| Four questions: what it is, how it works, what it is for, how it behaves in practice; the finding lives between the third and the fourth | `claim-discipline` §3 | core §0, v2.11, 2026-07-27 |
| Observation is kept separate from inference; several confidences are never merged into one number | [`claim-audit-tools/observation-status.js`](claim-audit-tools/observation-status.js); the five statuses of [`document-claim-checker/`](document-claim-checker/) | core §0, v2.14, 2026-07-29 |
| A phrase can be imitated, an address (file and line, command, hash) cannot | `claim-discipline` §2 | core §0, v2.14, 2026-07-29 |
| A finding carries what is wrong, what fixes it and who does it | the four-part line in `report-scope`; the defect history tables | core §2 rule N1, v2.14, 2026-07-29 |
| Search your own records before announcing a finding | `defect-register/register.js --compare`; `claim-discipline` §5 | core §2 trigger G6, v2.16, 2026-07-29 |
| A check that cannot fail is decoration | every fix here is shown to fail before it and pass after it | core §10, 2026-07-29 |
| Self-catch ratio A / (A + B): errors caught by the method itself against errors caught from outside; the classification must be made by someone other than the one who made the errors | [`defect-register/`](defect-register/) (found by instrument / found by the owner) | core §10, 2026-07-29; independent path v2.18, 2026-07-29 |
| Several models asked the same question are one answer, not several | [`ai-agent-skills/eval/`](ai-agent-skills/eval/) limitations | core §3; not in v1, present in v2.26, 2026-07-31 (the exact version it entered is not recorded) |
| Gating needs a control of equal cost; part of the cases must be measured without acting on the measurement; the detector is first tested on a planted case it must catch | not yet applied: the skill probe in `ai-agent-skills/eval/` has no equal-length control | specification §3 and §9, 2026-07-29 |
| A silent system can be sound or can have stopped sampling; a "PASS" whose conditions were not reproduced is missing data dressed as data | rule 3 above | worksheet §2, 2026-07-30 |
| A file cannot contain its own hash | `SHA256SUMS` lists every file except itself | core §8, v2.23, 2026-07-30 |

### Independent proof of existence: Bitcoin timestamp, 2026-07-27

On 2026-07-27 two digests were submitted to four OpenTimestamps calendars. The stamps stayed "pending" until 2026-10-26, when they were completed (`ots upgrade`) on new copies; the received originals (SHA-256 `1e77e41b…0ca3` and `b7d46875…7c2c`) are unchanged. The completed copies are in [`authorship-evidence/`](authorship-evidence/), with the full record in [`VERIFY_2026-10-26.txt`](authorship-evidence/VERIFY_2026-10-26.txt).

| Digest stamped | What it is | Anchored in Bitcoin block | Block time |
|---|---|---|---|
| `5740a72a4065b94b643e7207b66e941c5b97ee44717b516ca62524f3c717c3e5` | private manifest: SHA-256 of 141 method and book files, among them method core v2.12 (`586735e32d1f57e1cdfbe1f14179ac7daecf34ce1108b5a859b731a64fce6870`) and a declaration of authorship | 959855 (also 959856, 959857, 959901) | 2026-07-27 16:16:19 UTC |
| `411285d9e4c61b5aa136ab9d485164ce6e8b432feab32e33e7c930de41527279` | private archive of the same corpus (12 MB) | 959855 (also 959856, 959857, 959901) | 2026-07-27 16:16:19 UTC |

- 🟢 For each of the four blocks, the merkle root the stamp commits to equals the merkle root in the block header (blockstream.info), and the block hash agrees with a second explorer (mempool.space). Anyone can repeat this with `ots verify` and a Bitcoin node, or at opentimestamps.org.
- 🟢 This proves that the manifest, and therefore every file whose hash it lists, existed no later than 2026-07-27 16:16 UTC. That date no longer rests on what the documents say about themselves.
- 🟡 It covers the rules that were already in method core v2.12 (by its version history: the rows dated 2026-07-24 to 2026-07-27 above). Checking this against the text needs the v2.12 file itself, which is in the private archive.
- It does not prove who was first. Many parts have prior art, which the method core itself lists; the claim is the configuration, not the parts.

What this table does and does not show:
- 🟢 The v2.26 hash above is the same value recorded in the handoff note of 2026-07-31.
- 🟡 The dates in the first table are the dates written inside the documents, and a file can carry any date. The exception is the Bitcoin timestamp above, which fixes 2026-07-27 independently; versions after v2.12 have no independent timestamp.
- The rules are the owner's. The wording of the documents was produced with AI assistants, in conversation, from the owner's statements; the quoted statements in them are the owner's.

## Git history

Commits in this repository are made by an AI assistant from files reviewed by me. The commit message names the proof for the commit (test counts, hash checks). The author line is the assistant's; the review and the decision to push are mine.
