# agent-action-verifier

**Kind:** library (Node.js ≥ 18, zero dependencies; tests with `node:test`) · **Status:** candidate — in-process logic, never wired to a runtime · **Date:** 2026-09-07; two defects fixed 2026-10-26

## Purpose

Three small modules that refuse the shortcuts an AI-agent execution path tends to take after a permit has been issued:

- the adapter must not do more than it was permitted (`envelope.js`),
- an attempt's state must not be collapsed or rewound (`attempt.js`),
- "the adapter says it worked" must not count as "it worked" (`verifier.js`).

Each module is a refusal. Every passing test is a refusal test: an illegal transition throws, a transformed envelope stops, a non-independent probe is rejected, no verdict returns a retry right. This is the attempt/verify half of the design whose permit/claim/dispatch half is [`agent-execution-control`](../agent-execution-control/); the two were never run together.

## How it works

**`envelope.js` — X must not become X+Y.** Seven material fields (`action`, `object`, `target`, `scope`, `quantity`, `permissions`, `sideEffects`) are compared between what the permit authorised and what the adapter is about to do, after canonicalisation (sorted keys, so key order cannot hide a change). Any difference → `STOP` with the changed fields named. Two fields are explicitly free metadata (`requestedBy`, `traceId`, in `NON_MATERIAL_FIELDS`). **Every other field is unmodelled, and any difference in it — added, removed or changed — also STOPs** (`unmodelled:<name>`): a new harmless field has to be added to the metadata list on purpose, it never passes by default. The result is an object, never a boolean, so a caller cannot collapse it.

**`attempt.js` — states must not collapse.** `REQUESTED → CLAIMED → ATTEMPTED → COMPLETED → VERIFIED`, with `FAILED` and `UNKNOWN` as exits. Deliberate absences: nothing returns to `REQUESTED` (a claimed permit never becomes unclaimed); `UNKNOWN` goes nowhere without a human decision; `COMPLETED` does not reach `VERIFIED` on its own. `isSafeToRetry()` answers one question only — "do we know it did not happen?" — and is true only for a failure before dispatch. `humanResume()` on an `UNKNOWN` attempt throws: a resume clears a hold, it is not a new execution right.

**`verifier.js` — adapter success ≠ verified.** Takes the adapter's assertion and an independent probe reading as two inputs and refuses to run if they come from the same source. Probe present + adapter said failure → `CONTRADICTED`; probe absent + adapter said success → `CONTRADICTED`; no reading → `UNKNOWN`; partial → `PARTIAL`. Only `VERIFIED` opens the gate; `retryAuthorized` is hard-coded `false`.

## How to run

```bash
node test.js                      # 30 tests (22 original + 8 added 2026-10-26)
node --test-reporter=spec test.js # one line per test
```

## Evidence

| Claim | Command | Observed 2026-10-26 (Node v22.23.4) |
|---|---|---|
| Original package: 22/22 | `node test.js` on the unmodified copy | 22 pass, 0 fail |
| This folder: 30/30 | `node test.js` | 30 pass, 0 fail |
| Fix holds under variation | 5,000 envelopes, each with one added field (8 unlisted names → must STOP, 2 listed metadata names → must MATCH) | 0 wrong decisions |
| The original 22 tests still pass against this folder's modules | original `test.js` pointed at these modules | 22 pass, 0 fail |
| Package hash list verifies | `sha256sum -c SHA256SUMS.txt` in the original | 5/5 OK |

`evidence/2026-10-26/TESTS.txt` holds the three runs and the fuzz result.

## Findings (2026-10-26)

| # | What | Status | Proof |
|---|---|---|---|
| 1 | **A material field that is not on the list passed as `MATCH`.** `cc: ['boss@example.test']` or `attachments: ['payroll.xlsx']` added to an authorised envelope → `MATCH`, because only the seven listed fields were hashed and compared. The original's "belt and braces" branch (`hash disagrees but no field named → STOP <unmodelled>`) was **unreachable**: the hash covered the same seven fields. The original `LIMITATIONS.md` said "the hash fallback catches an added field" — it did not. | **Fixed (fail-closed), on Martin Urumov's decision of 2026-10-26.** Fields are now material (7, named), explicit metadata (`requestedBy`, `traceId`), or unmodelled; any unmodelled difference STOPs, and the hash covers unmodelled fields so the fallback branch is live. The original test *"non-material metadata does not STOP"* still passes because its two fields are the listed metadata. Trade-off, stated: any new harmless field (e.g. `debugNote`) now STOPs until someone adds it to the metadata list — that is the intended direction. | `test.js`: five tests on unmodelled fields; 5,000-envelope fuzz, 0 wrong |
| 2 | **`VERIFIED` did not say what was verified.** Adapter `FAILURE` + probe `EFFECT_ABSENT` → `VERIFIED`, gate `OPEN` — a verified *non*-execution with the same word and the same gate as a verified execution. A caller reading `outcome` alone cannot tell them apart. | **Fixed, non-breaking**: the result now carries `effect: PRESENT \| ABSENT \| PARTIAL \| NONE_READ`. No existing field or value changed; the 22 original tests pass unchanged. | `test.js`: three new tests on `effect` |

Both found by the AI assistant while re-running the package for this folder.

## Limitations

From the original `LIMITATIONS.md`, kept except where Finding 1 corrects it:
- No real-world execution: no adapter is called, no network, no database. `EXECUTED ≠ VERIFIED` applies to this package too.
- No exactly-once guarantee: in-process logic only. Multi-process atomicity lives in the PostgreSQL layer of `agent-execution-control`, not here.
- The verifier has no probe of its own. `verify()` takes a probe result as an argument; obtaining a genuinely independent reading of the world is the unsolved part, by design. This module only guarantees that a probe which is secretly the adapter is rejected.
- `MATERIAL_FIELDS` names seven fields; everything else is unmodelled and fails closed, except the two listed metadata fields. The lists are design decisions, not proofs.
- Never integrated with the runtime; the two halves have not been run together.

## Provenance

See [`PROVENANCE.md`](PROVENANCE.md). Source: `30_NAVIGATOR_MISSING_PARTS.zip` (SHA-256 `49b0ef5c…8d55`) from the document package of 2026-09-07. `attempt.js` byte-identical; `envelope.js` fail-closed handling of unlisted fields (Finding 1); `verifier.js` one added output field; `test.js` one identifier (`'martin'` → `'operator-1'`) and eight tests appended. `LIMITATIONS.md` not carried (its content is above, with the correction); the package's `SHA256SUMS.txt` is reproduced in `PROVENANCE.md`. File names kept — they already name the function.

## Contribution

- Martin Urumov: the specification the code was written to — the attempt states that must not collapse, "UNKNOWN is not safe to retry", "resume is not re-execute", the adapter's output is data and not authority, verification separated from the adapter's own claim.
- Martin Urumov also decided, on 2026-10-26, that Finding 1 is fixed fail-closed rather than left as a documented gap.
- AI assistants: the 2026-09-07 implementation and its 22 tests; the two findings of 2026-10-26, both fixes, the eight added tests and the fuzz check; this folder.
