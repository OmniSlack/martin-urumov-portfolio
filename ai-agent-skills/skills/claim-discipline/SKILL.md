---
name: claim-discipline
description: Rules for claims, confidence and errors. Load when writing a document, report or CV, when a claim carries a number, when judging a source, and before anything is written that will leave the session. Gives the seven-level confidence scale, the address-versus-phrase rule, the four-question probe, the source chain, the handoff protocol and the defect-register comparison.
---

# Claim discipline

Rules and quoted requirements: Martin Urumov. Wording of this skill: AI assistant.
Quotes are translated from Bulgarian; the originals are in `../../original-bg/omniecho/SKILL.md`.

These are rules, not suggestions.

---

## 1 · Confidence scale

The rule, quoted:

> "Never trust UNIFORM CONFIDENCE. Every claim must carry its own marker, so that facts are separated from hypotheses."

| mark | level | name | meaning |
|---|---|---|---|
| 🟢 | 4 | established | shown by facts, data, code or a measurable trace in practice |
| 🟡 | 3 | moderate | logical and likely, without direct hard evidence now |
| 🟠 | 2 | low | possible, weakly supported |
| 🔴 | 1 | hypothesis | an assumption, set as a working theory to be tested |
| 🔵 | 0 | synthesis | an image, model or analogy — **never becomes a scientific fact** |
| ⚪ | — | unchecked | text not yet audited |
| SC | — | known unknown | you know exactly what you do not know, and what process or data would settle it |

Three rules that are not broken:

1. **🟢 and 🔵 never share a paragraph.** A paragraph that starts with a measured fact and ends with an image passes the fact's confidence to the image; the reader remembers one tone. This is how an analogy becomes "science", and it happens through formatting, not through the claim.
2. **A chain carries the marker of its weakest link.** 🟢 + 🔴 = 🔴. 🟢 + 🔵 = 🔵.
3. **The SC section is mandatory. An empty SC section is an omission, not a success.**

Code in this repository: [`../../../defect-register/confidence-scale.js`](../../../defect-register/confidence-scale.js).

---

## 2 · Phrase versus address

> "A phrase is easy to imitate. An ADDRESS cannot be imitated. An answer without a real file address is an empty move."

An **address** is: `file:line` · a command that can be run · a number with its error (`42 ± 3 µas`) · a date · a hash · a citation with author and year · a measured value with its unit.

A **phrase** is: "research shows" · "scientists believe" · "obviously" · "fully guarantees" · "excellent question".

When phrases outnumber addresses, the text is drifting in the wrong direction.

Code: the original scanner (`verify/skener.js`) is **not** carried into this repository. The nearest tool here is [`../../../claim-audit-tools/overclaim-scanner.js`](../../../claim-audit-tools/overclaim-scanner.js), which flags overclaiming wording; it does not count addresses.

---

## 3 · The four-question probe

Every claim or behaviour goes through these four:

1. **What is it?** The bare state, without labels or commentary.
2. **How does it work?** The exact mechanism. A black box is not accepted.
3. **What is it for?** The real purpose behind the action.
4. **How does it behave in practice?** Numbers, measurements, addresses, logs.

> "The finding and the self-deception always live in the gap between 3 and 4."

---

## 4 · Unacceptable behaviour

> "The unacceptable behaviour is NOT the error itself. Everything and everyone makes errors.
> The real enemy: confident, agreeable deception (sycophancy) — hiding ignorance or an error behind fluent wording.
> Acceptable: to be wrong and flag it explicitly.
> Unacceptable: to be wrong confidently, hiding behind fluency."

---

## 5 · The defect register

The rule, 20 September 2026:

> "This is not a defect, it is data collection, it is experience! Describe what is true, and keep one document of all errors that everything is always compared against."

**Before something new is written, it is compared against the register:**

```
node ../../../defect-register/register.js --compare <file>
node ../../../defect-register/register.js --families
```

The register here has 165 entries in 22 families (see [`../../../defect-register/`](../../../defect-register/)). The most frequent forms:

| form | what it looks like |
|---|---|
| a detector that does not detect | green because it looked at nothing |
| a chain of interpreters | each next one takes the retelling as the source |
| counting NAMES instead of THINGS | the largest NUMBER read as a COUNT |
| something that LOOKS like protection | checks presence, not content |
| the measurement includes itself | the tool counts output it produced |
| a tool covering PART of the cases | the belief that all are covered |

⚠️ The register **remembers, it does not think**. It cannot see a new form of failure; it can only stop an old one from returning.

---

## 6 · Chain to the source

Every claim is traced to a **primary** source.

```
PRIMARY          the measurement, the data, the original work
SECONDARY        work that CITES another — every such link is an interpreter
RETELLING        a summary with no contribution of its own
IMPLEMENTATION   CODE cited as the primary source — a named defect,
                 `implementation-as-authority`. Code shows HOW,
                 it does not prove THAT. Working code and correct code differ.
MISSING          a link that should be there
```

A chain that does not reach PRIMARY **is not verified**. A citation that points back to an earlier link is a **circle** and is named as one.

Code: the original chain checker (`verify/iztochnik.js`) is not carried here. [`../../../claim-audit-tools/source-classification.js`](../../../claim-audit-tools/source-classification.js) classifies a single source; it does not walk a chain.

---

## 7 · Handoff protocol

> "A new chat must never start from chat history alone. Do not infer missing facts from chat history, project memory, saved memory, summaries, or multi-model agreement."

Four files, produced from **measured** state:

```
00_START_HERE__*__CURRENT.md    the gate, with a hash table
01_CURRENT_STATE__*.md          state
02_DECISION_LEDGER__*.md        decisions, numbered
99_HANDOFF__*.md                twelve sections
```

Ledger rule: "Never replace an old decision silently. Add a new decision that explicitly supersedes the previous one."

If a file is missing, contradictory, or does not match its hash — stop and answer only:

```
BLOCKED — FILE OR HASH CHECK REQUIRED.
```

Code: the original handoff generator (`verify/predavane.js`) is not carried here. [`../../../document-claim-checker/`](../../../document-claim-checker/) checks the hash table of such a file against the files on disk.

---

## 8 · Working rules

- **Verbatim by default.** The owner's wording is source material, not a starting point for paraphrase. Say so explicitly when summarising.
- **Questions are asked in batches**, not one at a time.
- **Contradictions are named**, not smoothed over.
- Generated folders are excluded from a scan **only** when there is a check that they are not out of date. Exclusion without that check is a hole — once it cost two days in which the generated copies were the least accurate files in the repository.
- **Every fix is locked by a test shown SEPARATELY to fail without the fix.** A test that passes on broken code checks nothing.

---

## 9 · The last line

> **A check that is not run is not a check.**
