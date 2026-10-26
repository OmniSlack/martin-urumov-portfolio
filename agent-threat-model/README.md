# agent-threat-model

**Kind:** research report (threat model and control baseline) · **Status:** design-level synthesis, not an implemented or assessed system · **Date:** 2026-08-03

## Purpose

A threat model for a system in which AI agents act with tools and credentials, extended to drone operations where a compromised identity or context can become a physical action. It maps the attack surface, ranks thirteen risks, separates observed procedural controls from missing technical ones, states a ten-part minimal control model, and proposes a seven-day plan in which every step is reversible and no step touches production. The document is [`THREAT_MODEL.md`](THREAT_MODEL.md).

## How it was built

- Scope set by the owner (Appendix A of the document).
- Sources: NIST, CISA, ENISA, EASA, EUR-Lex, OWASP and peer-reviewed papers (InjecAgent, ACL 2024; Kerns et al., Journal of Field Robotics; a GNSS spoofing/jamming systematic review). 21 priority sources in the register; every non-trivial design conclusion was cross-checked against at least two independent sources where possible.
- Every statement carries a confidence marker (🟢 🟡 🟠 🔴 🔵 ⚪) and a mode (`source`, `inference`, `observation`, `gap`). Marketing claims are marked as vendor claims, not effectiveness.
- A section "What does NOT fit the model?" lists eleven counter-models, including the ones that limit the report itself (no inventory exists; "apply all the data" was not honestly possible).

## How to verify

- Open the 21 links in the source register and the inline citations; each claim marked 🟢 `source` points at the standard, regulation or paper it rests on.
- Check the dated "update delta" (section 8) against the primary announcements it cites (OpenAI incident report, Google Beyond Zero, Microsoft Project Perception, EU AI Omnibus, EASA Part-IS).

## Evidence

| Claim | How to check | Status |
|---|---|---|
| The report existed on 2026-08-03 with this content | SHA-256 of the original file `41F57A52…799E`, cited in the owner's evidence pack of the same date and matched against the archive on 2026-10-26 | verified (hash match) |
| 21 registered sources; 29 unique URLs, 52 references in the original text (28 unique here: one link belonged to the removed section) | count the register; `grep -o 'https\?://[^ )]*' THREAT_MODEL.md \| sort -u \| wc -l` | verified |
| Risk ranking, control model and plan | design-level reasoning with cited support | not empirically tested — stated as such in the document |

## What was left out of this edition, and why

Three parts of the original were removed for this repository: a subsection using the owner's private review vocabulary (the "flags" subsection of the counter-models), a section on professional direction and relocation (personal, not technical), and a closing proposal section written in the same private vocabulary. Internal project and file names in the body were replaced by generic terms ("the project", "the governance-rules file", "private drafts"). Nothing in the technical content — surface map, risks, controls, plan, counter-models, update delta, sources — was changed in substance. The original file is unchanged and its hash is recorded in [`PROVENANCE.md`](PROVENANCE.md).

## Limitations

- No inventory of real agents, credentials, cloud services or UAS hardware existed; likelihoods are relative priorities for a typical agentic system, not measured frequencies.
- Nothing here is a penetration test, a live assessment or proof that any control is implemented.
- The GNSS/C2 material is literature-based; no interference test was performed or proposed outside simulator/HIL or a lawfully shielded laboratory.
- The update delta is dated 2026-08-03; several items name reports that were still pending then.

## Provenance

See [`PROVENANCE.md`](PROVENANCE.md). English edition of a Bulgarian/English original (158 of 266 lines were Bulgarian); translated and edited as described above.

## Contribution

- Martin Urumov: the research task and its scope (Appendix A), including the decision to add drone operations and to require "What does NOT fit the model?" as a mandatory deliverable; the two-independent-sources rule; review of the result and the decision to keep it as a draft rather than adopt it.
- AI research assistant: source search, synthesis and the writing of the report on 2026-08-03; in this repository the translation and the edits listed above.
