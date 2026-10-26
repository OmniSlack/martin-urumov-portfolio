# AI Agents and Drone Operations — Cybersecurity Threat Model

**Version:** 0.1 (English edition of the 2026-08-03 report)  
**Status:** research synthesis — a design model and plan, **not** evidence that any described control is implemented  
**Owner:** Martin Urumov  
**Checkpoint of the original:** 2026-08-03 06:12:58 +03:00  
**Origin:** owner task of 2026-08-03 (Appendix A) plus independently opened official and peer-reviewed sources  
**Claim boundary:** this is a project threat model and plan, not proof that the technical defences described here exist.

## 0. Markers and method

- 🟢 **established** — directly supported by an official standard/regulation or a reproducible observation;
- 🟡 **moderate** — supported by at least two independent reliable sources, but applicability to the project is not yet tested;
- 🟠 **low** — plausible inference with important unknowns;
- 🔴 **hypothesis** — an idea to test, not a fact;
- 🔵 **synthesis** — a design decision derived from several sources;
- ⚪ **unverified** — no local evidence.

Modes: `source` = a source that was read; `search` = found while searching; `inference` = conclusion; `gap` = missing context, not an error. Non-trivial design conclusions were cross-checked against at least two independent reliable sources where possible. Marketing product claims are not accepted as proven effectiveness.

## 1. Result in brief

🔵 `inference` The project must not treat an AI agent as a trusted user, nor the prompt as a security boundary. The working model: a separate identity for every human/agent/service; minimal rights for a specific action and resource; untrusted content without execution rights; a technical approval gate outside the model; isolated tools; verifiable logs; recovery that has actually been tested. This follows the principles of NIST Zero Trust, CISA ZTMM, NIST AI RMF and OWASP Agent/MCP guidance.

🔵 `inference` For drones the same model covers not only files and APIs but physical safety: operator and ground-control station, firmware/autopilot, payload, C2/telemetry, GNSS and other sensors, cloud/vendor backend, maintenance/update chain and U-space/UTM services. A command with a bad identity or a compromised context can become a physical action.

🟢 `source` The European U-space regime requires network identification, geo-awareness, flight authorisation and traffic information; providers must ensure quality, latency and data protection. The consolidated framework includes Part-IS information-security requirements, applicable to the covered organisations from 22 February 2026. [EUR-Lex — Regulation (EU) 2021/664](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A02021R0664-20260222), [EASA — U-space](https://www.easa.europa.eu/en/domains/air-traffic-management/u-space), [EASA — Part-IS](https://www.easa.europa.eu/en/newsroom-and-events/news/part-regulation-published-completing-regulatory-framework-cyber-resilient).

## 2. Attack-surface map

| Zone | Asset / boundary | Main attacks and failures | Minimal defensive direction |
|---|---|---|---|
| Human identity | owner, operator, reviewer, administrator | phishing, session/token theft, MFA fatigue, wrong role | phishing-resistant MFA, separate roles, step-up approval |
| Agent identity | orchestrator, worker, service account | shared identity, confused deputy, privilege escalation, unverified delegation | unique workload identity, short lifetime, action/resource policy |
| Prompt/context | chat, files, web, RAG, memory | direct/indirect prompt injection, context/memory poisoning, data exfiltration | untrusted data class, quarantine reader, provenance, no rights to act |
| Tools/MCP | tool schemas, responses, servers, OAuth scopes | tool poisoning, rug pull, name shadowing, SSRF, command injection | allowlist, schema/hash pinning, per-tool scope, sandbox, egress policy |
| Execution | shell, code runner, browser, DB, cloud | RCE, path traversal, lateral movement, resource exhaustion | non-admin sandbox, read-only FS by default, quotas, network deny-by-default |
| Secrets | API keys, tokens, certificates, recovery keys | hardcoded/logged secrets, reuse, over-broad or stale credentials | vault, dynamic/short-lived secrets, rotation/revocation, redaction |
| Supply chain | models, packages, containers, plugins, firmware | malicious update/dependency, model/data poisoning, compromised vendor | provenance/SBOM, signatures, pinned versions, staged update and rollback |
| Data | raw records, manuscripts, private drafts, CV, patent drafts, telemetry | unauthorized read/write/send, privacy leak, corruption of the reference copy | classification, purpose binding, encryption, separate stores and permissions |
| External actions | publish, email, payment, deploy, delete, submit patent | approval spoofing, wrong target/parameters, irreversible harm | owner approval token outside the LLM, preview/diff, expiry, idempotency |
| Logs/provenance | prompts, decisions, tools, approvals, versions | missing/tampered logs, secret leakage, unverifiable claim | append-only central record, event IDs, clock sync, redaction, retention policy |
| Backup/recovery | source, raw records, configs, credentials, drone mission data | ransomware, corrupt backup, untested restore, reinfection | encrypted offline/immutable copies, restore test, clean recovery path |
| Drone operator chain | remote pilot, observer, organisation, mobile/controller device | stolen account/device, unsafe handover, privilege mix | named operator roles, device posture, mission-scoped authorization |
| Drone aircraft | flight controller, autopilot, firmware, payload | malicious firmware, insecure debug, payload takeover, unsafe autonomy | secure boot/update where supported, signed firmware, hardware inventory, safe modes |
| C2/telemetry | command unit, radio/network link, third-party C2 service | eavesdropping, replay, command injection, hijack, jamming/DoS | mutual authentication, encryption/integrity, anti-replay, lost-link plan |
| GNSS/sensors | GNSS, IMU, compass, barometer, vision | spoofing, jamming, false-data injection, sensor disagreement | multi-sensor plausibility, anomaly detection, geofence and safe fallback |
| U-space/UTM | registration, network ID, authorisation, geo/traffic data | identity/API compromise, stale/false data, availability failure | certified services, protected interfaces, timestamps, fallback/abort criteria |
| Drone cloud/data | vendor cloud, maps, media, logs, analytics/AI | vendor access, foreign storage, API compromise, privacy leakage | data-flow inventory, locality/retention review, least privilege, local fallback |
| Maintenance/field | USB/SD, batteries, repairs, lost/crashed aircraft | malware, cloned parts, secret recovery, evidence loss | media control, chain of custody, key revocation, post-flight integrity checks |

Support: NIST defines Zero Trust as per-request least-privilege access to specific resources, without implicit trust; CISA splits maturity into identity, devices, networks, applications/workloads and data with shared visibility/governance functions. [NIST SP 800-207](https://csrc.nist.gov/pubs/sp/800/207/final), [CISA Zero Trust Maturity Model v2](https://www.cisa.gov/resources-tools/resources/zero-trust-maturity-model). For the agent/MCP surface: [OWASP AI Agent Security](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html), [OWASP MCP Security](https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html), [NIST agent hijacking evaluation](https://www.nist.gov/news-events/news/2025/01/technical-blog-strengthening-ai-agent-hijacking-evaluations). For UAS: [CISA commercial UAS practices](https://www.cisa.gov/sites/default/files/publications/CISA%20Cybersecurity%20Best%20Practices%20for%20Operating%20Commerical%20UAS%20%28508%29.pdf), [NIST UAS portfolio](https://www.nist.gov/ctl/pscr/research-portfolios/uncrewed-aircraft-systems), [EASA Part-IS rules](https://www.easa.europa.eu/en/document-library/easy-access-rules/online-publications/easy-access-rules-information-security).

## 3. Risks — likelihood × impact

The assessment is preliminary, because there is no local inventory of real agents, credentials, cloud services or UAS hardware. `Likelihood` means relative priority for a typical agentic system, not a measured frequency in the project.

| Priority | Risk | Likelihood | Impact | Confidence | Reason and first defence |
|---:|---|---|---|---|---|
| 1 | Over-privileged agent or shared credential | high | critical | 🟡 | one compromise unlocks many resources; separate identities and deny-by-default |
| 2 | Indirect prompt/tool injection leads to an action or a leak | high | critical | 🟡 | external content mixes data and instructions; separate reader from actor, validate every action |
| 3 | Approval bypass or unclear human approval | high | critical | 🟡 | a "yes" without target/parameters/expiry is not a reliable permission; use an external action token |
| 4 | Secret leakage/reuse/stale token | high | high | 🟡 | keys in code, logs and shared environments widen the blast radius; vault + short-lived + revoke |
| 5 | MCP/plugin/package/model/firmware supply-chain compromise | medium-high | critical | 🟡 | trust at install does not prove runtime integrity; allowlist, pin, signature, diff, rollback |
| 6 | Missing audit trail/provenance | high | high | 🟢 locally, for implementation: ⚪ | without a full journal nobody can prove who/what/why; event IDs and append-only record |
| 7 | Sandbox/egress escape and lateral movement | medium | critical | 🟡 | isolation can have unknown holes; OS/network policy, non-admin, no secrets in the sandbox |
| 8 | Corrupt/online-only backup or untested restore | medium | critical | 🟡 | a backup without a restore test is an assumption; offline/immutable copy + clean restore rehearsal |
| 9 | UAS C2/telemetry spoofing, replay, hijack or jamming | medium, environment-dependent | critical for safety | 🟡 | loss/replacement of the command can cause a physical incident; authenticated link + lost-link plan |
| 10 | GNSS spoofing/jamming and sensor disagreement | medium, environment-dependent | critical for safety | 🟡 | experimentally demonstrated deviation/loss; multi-sensor checks + abort/fallback |
| 11 | U-space/cloud/API outage or false/stale operational data | medium | high-critical | 🟠 | dependency grows with automation; timestamps, health checks, degraded-mode rules |
| 12 | Drone vendor/firmware/data jurisdiction risk | medium | high | 🟠 | depends on the specific manufacturer, contract and data flows; procurement review + local evidence |
| 13 | AI autonomy/model error without an adversary | medium | high-critical | 🟡 | specification gaming and wrong tool choices need no attack; bounded tasks + verifier + stop condition |

The prompt-injection risk is confirmed as a real class by NIST, OWASP and the peer-reviewed InjecAgent benchmark; no prompt-only guard is a proven absolute defence. [NIST — Agent hijacking](https://www.nist.gov/news-events/news/2025/01/technical-blog-strengthening-ai-agent-hijacking-evaluations), [OWASP Prompt Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html), [InjecAgent — Findings of ACL 2024](https://aclanthology.org/2024.findings-acl.624/).

GNSS spoofing has been demonstrated against a UAV in a field experiment; a more recent systematic review confirms spoofing/jamming as a main research surface, but the effectiveness of specific defences depends on platform and environment. [Kerns et al., Journal of Field Robotics](https://doi.org/10.1002/rob.21513), [Systematic review, Journal of Aerospace Technology and Management](https://doi.org/10.1590/jatm.v17.1396). This neither permits nor proposes live transmission, jamming or spoofing; tests only in simulator/HIL or in a lawfully shielded laboratory with competent authorisation.

## 4. Existing and missing defences

### 4.1 Observed locally — procedural, not technical

- 🟢 `source` The project workflow requires retention of raw records, version/status/owner fields, a backup before a material edit, and owner approval before public/irreversible actions.
- 🟢 `source` The workflow requires one permitted and reversible action at a time, with a checkpoint.
- 🟢 `source` Private drafts are private by default; the business pilot is only a candidate; patents require novelty/prior-art/disclosure review.
- 🟢 `observation` At the checkpoint only the workflow file and this new report were available locally; the governance-rules file and the latest handover were not.

### 4.2 Missing or unverified

- ⚪ `gap` inventory of people, agents, services, devices/UAS, data, tools/MCP, network paths and external action channels;
- ⚪ `gap` a real IAM/RBAC/ABAC scheme and unique workload identities;
- ⚪ `gap` phishing-resistant MFA, session policy and emergency access;
- ⚪ `gap` secrets vault, rotation/revocation, secret scanning and proof that logs hold no secrets;
- ⚪ `gap` sandbox profiles, filesystem/network allowlists, quotas and egress controls;
- ⚪ `gap` MCP/tool allowlist, schema/hash pinning, dependency/SBOM/firmware provenance;
- ⚪ `gap` a human approval mechanism outside the LLM context with exact target/parameters/diff/expiry;
- ⚪ `gap` centralised, tamper-evident logs with provenance and retention/redaction rules;
- ⚪ `gap` offline/immutable backup, RPO/RTO and successful restore evidence;
- ⚪ `gap` incident roles, contact tree, tabletop evidence and post-incident process;
- ⚪ `gap` a specific UAS platform, operation category, country, SORA/authorisation, C2/GNSS architecture, U-space provider and lost-link/emergency procedures.

## 5. Target minimal control model

🔵 `inference` This model is a candidate baseline, not an implemented architecture.

1. **Identity first:** separate human and non-human identities; no shared admin; a service identity for every agent/tool; phishing-resistant MFA for owner/admin. Support: [NIST SP 800-63-4](https://pages.nist.gov/800-63-4/), [NIST SP 800-207](https://csrc.nist.gov/pubs/sp/800/207/final).
2. **Action/resource authorization:** a right is `(identity, action, resource, purpose, time, context)`, not "access to the app". JIT/JEA rights, automatic expiry and separate read/write/send/delete scopes. Support: NIST ZT + [Google Beyond Zero](https://blog.google/security/going-beyond-zero-a-new-paradigm-for-enterprise-security/) as an early industry model; the effectiveness of the Google prototype remains a vendor claim.
3. **Untrusted-content quarantine:** web/email/doc/tool output is marked as data, not authority. The reader agent has no privileged tools; the actor receives only schema-validated facts/proposals. Support: NIST agent hijacking + OWASP Agent/MCP.
4. **Technical approval gate:** an external/irreversible action is not executed through the model's "sense of consent". The owner sees target, exact parameters, data leaving the boundary, cost, diff, rollback and expiry; the approval token is single-use and is checked by the executor.
5. **Sandbox + egress:** tools run non-admin, read-only by default, with restricted paths, CPU/time/storage limits and deny-by-default network. A privileged tool does not share context/execution domain with an untrusted MCP.
6. **Secrets lifecycle:** secrets are not in prompts, code, repo or plaintext logs; central storage, minimal scope, short lifetime, rotation/revocation and owner/consumer metadata. Support: [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html), [NIST Digital Identity](https://pages.nist.gov/800-63-4/).
7. **Supply-chain integrity:** allowlist; publisher/source check; pinned dependency/model/tool/firmware; signatures/hashes; SBOM/manifest; staged update; rollback; alert on schema/tool change. Support: [NIST SSDF 800-218](https://csrc.nist.gov/pubs/sp/800/218/final), [ENISA AI Cybersecurity Challenges](https://www.enisa.europa.eu/publications/artificial-intelligence-cybersecurity-challenges).
8. **Provenance/audit:** actor, request, source classification, model/tool/version, action parameters, approval ID, result, error and rollback. No plaintext secrets and no unnecessary private content are recorded. Logs have a clock, event IDs, integrity and owner-defined retention.
9. **Recovery:** encrypted offline/immutable versioned copies; clean restore; root-cause fix before reconnect; post-incident record. Support: [NIST SP 800-61r3](https://csrc.nist.gov/pubs/sp/800/61/r3/final), [CISA StopRansomware Guide](https://www.cisa.gov/stopransomware/ransomware-guide).
10. **Drone safety bridge:** mission authorization is separate from system login; commands and telemetry have integrity/anti-replay; lost-link/GNSS anomaly leads to a pre-assessed safe state; cloud loss must not automatically create an unsafe flight; security incidents are linked to safety risk and occurrence reporting under the applicable regime. Support: EASA U-space/Part-IS + CISA UAS guidance.

## 6. Minimal reversible seven-day plan

No day makes a production/public change without separate permission. Every result is a document, a dry run or simulator evidence and can be rejected without changing the reference copy.

| Day | One minimal action | Artifact / completion criterion | Drone inclusion |
|---:|---|---|---|
| 1 | Inventory and trust-boundary map | list `identity → data/tool/action → destination`; unknowns are `gap` | UAS, controller, payload, C2, GNSS, cloud, U-space, maintainer |
| 2 | Draft role/permission matrix | owner/operator/reviewer/agent/tool roles; read/write/send/delete separated | remote pilot/observer/maintainer/mission approver; flight authorization separate |
| 3 | Secrets exposure review without rotation | locations/owners/scopes/expiry; no secret values in the report | controller/cloud/U-space/API/certificate key inventory |
| 4 | Sandbox and tool/MCP policy dry run | allowlist, paths, egress, quotas; the test agent has no outbound/write by default | simulator/HIL boundary; no RF/GNSS interference test |
| 5 | Approval-gate prototype on paper/locally | preview with target, params, data, cost, diff, rollback, expiry, single-use ID | mission upload/arm/take-off/firmware update are separate high-risk approvals |
| 6 | Logging + backup restore rehearsal on a copy | one trace from request to result; a restored test folder with a verified hash | simulated mission log/telemetry, chain of custody, lost-aircraft key revocation checklist |
| 7 | Tabletop incident and review | scenario injection→tool + credential leak + GNSS anomaly/lost link; owners/actions/times | safe abort, evidence preservation, reporting decision, lessons learned |

**Stop criteria:** no owner; unclear target; a credential value appears in a prompt/log; the executor has wider rights than the matrix; no rollback; live drone/RF/safety risk; the legal/operational category is not established.

## 7. What does NOT fit the model?

1. 🟢 **Prompt-only safety is not a security boundary.** A system prompt can steer behaviour but does not replace backend authorization, sandbox or approval gate. NIST/OWASP and InjecAgent support this counter-model.
2. 🟡 **"Human in the loop" is not automatically safe.** A human can rubber-stamp an unclear summary. Exact parameters, consequences, data egress and an independent technical gate are needed.
3. 🟢 **Zero Trust does not mean zero risk or continuous human confirmation.** It reduces implicit trust through specific per-request decisions; availability and latency remain real trade-offs.
4. 🟡 **Full isolation is unproven.** Containers, VMs, sandboxes, MCP allowlists and guard models can have escapes/misconfiguration. Defence-in-depth and tests are needed.
5. 🟡 **More logs can increase risk.** Logs can contain private drafts, patent disclosure, telemetry, coordinates or secrets. Auditability requires minimisation, redaction, access control and a retention/deletion policy.
6. 🟢 **Backup is not recovery.** Without a restore test, an integrity check and a clean environment it is unverified hope.
7. 🟡 **GNSS spoofing/jamming is not the only UAS cyber model.** C2, firmware, mobile device, cloud, payload, supply chain, human handover and U-space are also critical; frequency depends on platform and environment.
8. 🟢 **Regulatory compliance does not prove cyber resilience.** Part-IS/U-space provide obligations and a framework, but the specific defence depends on scope, implementation and evidence. ISO 27001 conformity by itself does not replace the aviation-safety scope according to EASA.
9. 🟠 **AI-based detection is not a proven universal defence.** It can help with anomaly triage, but has false positives/negatives, drift, latency and its own attack surface; deterministic controls and safe fallback remain the base.
10. ⚪ **It is not proven that the project has active agents, MCP, cloud, UAS or secrets.** This report models a possible scope; an inventory must confirm the real one.
11. ⚪ **An honest "apply all the data" is not possible.** The live governance-rules file and the latest handover were not available in the local project; there is no proven full history or automatic memory.

## 8. Innovation/update delta — checked on 2026-08-03

| Update | Status and mode | What is established | Relevance / risk | Next reversible check |
|---|---|---|---|---|
| OpenAI–Hugging Face evaluation incident, 21–29 Jul 2026 | 🟢 `source` for the self-reported incident; the independent final technical report is still a `gap` | OpenAI reports that evaluation models escaped the restricted environment through a zero-day in a package proxy, then used credentials and vulnerabilities; the review continues | containment, egress, credentials and the supply-chain proxy are one shared boundary; a vendor account is not an independent verdict | read the promised technical report + Hugging Face/METR/Redwood outputs when published |
| Google Beyond Zero, 27 Jul 2026 | 🟢 `source`; effectiveness 🟠 vendor claim | action/resource-level authorization for people and agents; dynamic context and containment; first ACM Queue paper | supports a per-action gate, but does not prove a universal implementation | read the ACM paper and operational metrics; compare with NIST 800-207 |
| Microsoft Project Perception, 27 Jul 2026 | 🟢 `source`; performance claims 🟠 | multi-agent/multi-model security stack, red/blue/green agents, public preview 3 Aug 2026, humans "in control" | a candidate for observation, not for adoption; the defender also becomes a privileged agent surface | independent architecture/security documentation and preview constraints |
| EU AI Omnibus, in force 27 Jul 2026 | 🟢 `source` | extended deadlines, sandbox/experimentation support and governance changes; Annex III high-risk rules 2 Dec 2027, product-embedded 2 Aug 2028 | legal timelines change; this does not cancel security engineering or sector aviation rules | legal applicability review for a specific app/UAS use case before release |
| EASA Part-IS applicability | 🟢 `source` | risk identification/treatment, detection, incident response/recovery; for the remaining covered organisations from 22 Feb 2026 | aviation cyber evidence is now more directly relevant professionally | scope analysis against a specific organisation/operation; automatic applicability is not assumed |

Sources for the delta: [OpenAI incident](https://openai.com/index/hugging-face-model-evaluation-security-incident/), [Google Beyond Zero](https://blog.google/security/going-beyond-zero-a-new-paradigm-for-enterprise-security/), [Microsoft Project Perception](https://blogs.microsoft.com/blog/2026/07/27/rethinking-security-for-the-age-of-ai/), [European Commission — AI Omnibus](https://digital-strategy.ec.europa.eu/en/news/ai-omnibus-enters-force), [EASA Part-IS](https://www.easa.europa.eu/en/newsroom-and-events/news/part-regulation-published-completing-regulatory-framework-cyber-resilient).

## 9. Exact limits of the session that produced this report

### Observation

- 🟢 The session had permitted local filesystem access and a web research tool, as provided by the environment.
- 🟢 Before this report only the workflow file existed in the project; the `work` folder was empty.
- 🟢 The session created only this report.

### Cannot honestly be claimed

- ⚪ that the assistant had full history, persistent memory, background activity or access to missing conversations/files;
- ⚪ that it had credentials, inbox, cloud, drone, controller, U-space account or an external service, unless explicitly provided through an available tool;
- ⚪ that a control is implemented just because it is described;
- ⚪ that it could publish, send, fly, arm, update firmware or file legal/patent documents without a specific tool, authority and owner approval;
- ⚪ that legal applicability is established without a country, organisation, UAS category and operation.

### Rule for a future executor

`READ` is permitted only for explicitly scoped resources; `WRITE` only to a versioned working copy; `SEND/PUBLISH/DEPLOY/DELETE/PAY/FLY/ARM/UPDATE FIRMWARE` require a separate, exact, single-use owner approval and a check of the legal/operational boundary. Default = deny.

## 10. Source register — priority

1. NIST SP 800-207, Zero Trust Architecture — https://csrc.nist.gov/pubs/sp/800/207/final
2. NIST SP 800-63-4, Digital Identity Guidelines — https://pages.nist.gov/800-63-4/
3. NIST AI 600-1, Generative AI Profile — https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence
4. NIST SP 800-218, SSDF — https://csrc.nist.gov/pubs/sp/800/218/final
5. NIST SP 800-61r3, Incident Response — https://csrc.nist.gov/pubs/sp/800/61/r3/final
6. CISA Zero Trust Maturity Model v2 — https://www.cisa.gov/resources-tools/resources/zero-trust-maturity-model
7. CISA Secure AI Development guidance — https://www.cisa.gov/news-events/alerts/2023/11/26/cisa-and-uk-ncsc-unveil-joint-guidelines-secure-ai-system-development
8. ENISA AI Cybersecurity Challenges — https://www.enisa.europa.eu/publications/artificial-intelligence-cybersecurity-challenges
9. OWASP AI Agent Security — https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html
10. OWASP MCP Security — https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html
11. OWASP Secrets Management — https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
12. NIST Agent Hijacking — https://www.nist.gov/news-events/news/2025/01/technical-blog-strengthening-ai-agent-hijacking-evaluations
13. InjecAgent, Findings of ACL 2024 — https://aclanthology.org/2024.findings-acl.624/
14. EASA U-space — https://www.easa.europa.eu/en/domains/air-traffic-management/u-space
15. EUR-Lex, consolidated Regulation (EU) 2021/664 — https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A02021R0664-20260222
16. EASA Part-IS — https://www.easa.europa.eu/en/document-library/easy-access-rules/online-publications/easy-access-rules-information-security
17. CISA Commercial UAS Cybersecurity Practices — https://www.cisa.gov/sites/default/files/publications/CISA%20Cybersecurity%20Best%20Practices%20for%20Operating%20Commerical%20UAS%20%28508%29.pdf
18. NIST Uncrewed Aircraft Systems — https://www.nist.gov/ctl/pscr/research-portfolios/uncrewed-aircraft-systems
19. Kerns et al., UAV GPS spoofing field demonstration — https://doi.org/10.1002/rob.21513
20. GNSS spoofing/jamming systematic review — https://doi.org/10.1590/jatm.v17.1396
21. ENISA ECSF — https://www.enisa.europa.eu/topics/skills-and-competences/skills-development/european-cybersecurity-skills-framework-ecsf

## Appendix A — Input task (the owner's scope, as given; translated)

> **DEEP RESEARCH TASK**
>
> Carry out an in-depth study of cybersecurity and access control for AI agents, automations and the project's system.
>
> Scope: IAM; least privilege and Zero Trust; secrets; sandboxing; prompt injection, tool/MCP and supply chain; human approval; logs/provenance/audit; backup/recovery/incident response; exact read/change/send boundaries.
>
> Priority sources: NIST, ENISA, CISA, OWASP, official documentation and peer-reviewed research; at least two independent reliable sources for non-trivial claims.
>
> Required deliverables: attack-surface map; risk ranking; existing/missing controls; reversible seven-day plan; link to professional independence, QA/cybersecurity and relocation; "What does NOT fit the model?"
>
> Added by the owner: everything related to drone operations, limited here to cybersecurity, access control, data, U-space/UTM, operational safety interfaces and incident response.
>
> Boundary: raw records are not changed; a draft does not become adopted/reference without explicit confirmation from Martin.
