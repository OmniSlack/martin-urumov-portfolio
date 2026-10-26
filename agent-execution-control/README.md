# agent-execution-control

**Kind:** tool (TypeScript / Node.js ≥ 24, PostgreSQL 16; dev dependencies: `typescript`, `pg`) · **Status:** prototype, verified locally; not a deployment · **Date:** frozen 2026-08-17; STOP-dominance fix 2026-09-07; type fix 2026-10-26

## Purpose

A control layer that decides whether an AI agent may carry out a protected action, and makes the database — not prompt text — enforce the decision. Before an action can run it needs an exact match of identity, version and dependency digest, a separate risk decision that is not itself a permission, an open gate with no active hold, and a single-use permit that has not expired — checked again at dispatch. An ambiguous outcome is recorded as `UNKNOWN`, never retried, and nothing reaches `VERIFIED` except through independent verification after completion.

## Components (names used in the code)

| Name | What it is |
|---|---|
| **Core** | the proposal evaluator; returns `CLEAR`, `HOLD` or `UNKNOWN` for one exact proposal digest |
| **Navigator** | the planner; proposes, never authorises |
| **Human** | issues the single-use permit; cannot override a `HOLD` or `STOP` |
| **Execution Control** | the gate: permit → claim → dispatch, each step re-checked against the database state |
| **Adapter** | performs exactly the permitted action; its "success" report is only `ATTEMPTED` |
| **Verifier** | independent read-back; only it can move an attempt to `VERIFIED` |

The authority rules are in [`AUTHORITY_MODEL.md`](AUTHORITY_MODEL.md).

## How it works

1. **Dual gate at issue.** A permit is issued only when the execution gate is `OPEN` with no active hold **and** a current Core `CLEAR` exists for the exact proposal digest (migration `004_no_override_dual_gate.sql`). Human `YES` with Core `HOLD`/`UNKNOWN` → no permit.
2. **Severity hierarchy.** Gate states `STOP > HOLD > OPEN`; `STOP` is terminal and cannot be demoted by a later `HOLD` or by resolving one.
3. **Single-use claim.** A permit yields exactly one claim, under PostgreSQL advisory locks; a replay or a concurrent second claim is rejected (`two concurrent processes produce exactly one single-use claim`).
4. **Re-check at dispatch.** Expiry, hold, revoke, version drift and dependency drift are checked again immediately before the Adapter is called; a `HOLD` committed first blocks the start, a `HOLD` committed after the dispatch barrier is serialised behind it.
5. **Fail-closed outcomes.** Adapter did not start → `CANCELLED`; ambiguous start → `UNKNOWN` (not retried); abandoned `CLAIMED` attempts are atomically moved to `UNKNOWN` by the reconciler; expiry is persisted before the rejection is reported.
6. **Evidence before commit.** A failed revoke rolls back without writing `PERMIT_REVOKED`; a successful one records evidence after the transition and before commit. Database triggers reject invalid permit/attempt transitions and corrupted rows.

## How to run

```bash
npm ci                                   # dependency identity = package-lock.json
npm run typecheck                        # tsc --noEmit
npm run test:unit                        # node --test test/unit/*.test.ts   (in-memory repository)
# PostgreSQL suite: expects a container named navigator-pg-stage1 reachable through `docker exec`,
# PostgreSQL on port 54329 (phase2.config.json). Without Docker, see tools/docker-shim-local-postgres.sh.
PG_TEST_PORT=54329 npm run test:postgres
```

`RUN_LOCAL.ps1` / `LOCAL_RUN.txt` are the original Windows run notes of the frozen package.

## Evidence

| Claim | Where | Observed |
|---|---|---|
| Frozen package 2026-08-17: typecheck PASS, 53 unit, 24 PostgreSQL, 0 failed | [`evidence/2026-08-17/`](evidence/2026-08-17/) — the package's own evidence files; their SHA-256 (`C87B9865…8898`, `EBA9DB3C…9958`, `9F833BC8…3454`) match the values stated in `IMPLEMENTATION_EVIDENCE.md` and the package manifest | **Verified** (hashes); run itself **Reported** |
| 2026-10-26, this copy: `tsc --noEmit` exit 0; **54 / 54** unit; **24 / 24** PostgreSQL against a real PostgreSQL 16 (including the restart/replay test) | [`evidence/2026-10-26/`](evidence/2026-10-26/) with `ENVIRONMENT.txt` | **Reproduced** |
| Test code byte-identical to the 2026-09-07 working copy except one test title | [`PROVENANCE.md`](PROVENANCE.md) | verified by hash |

## Defect history

| Date | What | Proof |
|---|---|---|
| 2026-09-07 | **STOP could be demoted.** `resolveExactHold()` and `addHold()` (PostgreSQL repository and in-memory test double) set the gate to `HOLD`/`OPEN` without checking for `STOP`. Fixed with `CASE WHEN state='STOP' THEN 'STOP'` guards in SQL and `if (this.gate !== "STOP")` guards in the test double; regression test *"STOP remains dominant when a protected HOLD is added and resolved"* added (53 → 54 unit tests). | `test/unit/authority.test.ts`; `ORIGINAL_SHA256SUMS.txt` shows exactly the three patched files as mismatches against the frozen manifest |
| 2026-09-07 → found 2026-10-26 | **The fix broke the type check.** The guard in `resolveExactHold()` was nested twice; after the outer check narrows the type, the inner `!== "STOP"` is `TS2367`. `tsc` failed while all 54 tests passed. | reproduced on the 2026-09-07 copy: `test/helpers.ts(70,7): error TS2367` |
| 2026-10-26 | Duplicate guard removed; behaviour identical. | `tsc` exit 0; 54/54; 24/24 |

Lesson recorded: a green test run is not a green build. Typecheck and tests are separate gates and both are run.

## Limitations

From the package's own `LIMITATIONS.md`, unchanged:
- Verification is local, not production-deployment evidence. No remote deployment, no real Adapter action, no real external effect was verified.
- The tests prove the enumerated authority, persistence, concurrency and fail-closed behaviours; they do not prove arbitrary statements.
- `node_modules` is excluded; dependency identity is `package-lock.json`. OS, Node binary, Docker image and PostgreSQL binary are not frozen.
- The Verifier has no probe of its own; obtaining a genuinely independent reading of the world is unsolved by design.
- The 2026-10-26 run used the frozen package's own `node_modules` and a local PostgreSQL 16 through a `docker` shim, not Docker.

## Provenance

See [`PROVENANCE.md`](PROVENANCE.md). Source: `NAVIGATOR_RUNTIME_R4_PG_FIX_R1.rar` (the post-2026-09-07 working copy, `node_modules` included). Changes in this copy: one test title (`Martin issue` → `Human issue`), the package name, the duplicate guard, and `CORE_REFERENCE.md` rewritten as `AUTHORITY_MODEL.md`. Everything else is byte-identical. The package's `EVIDENCE_SHA256.txt` (a hash listing with local Windows paths) is not carried; its three hashes are in `IMPLEMENTATION_EVIDENCE.md`.

## Contribution

- Martin Urumov: the requirements that make this layer what it is — a permission is not a risk decision and a risk decision is not a permission; `STOP` is terminal; one permit, one claim; everything re-checked at dispatch; an ambiguous outcome is `UNKNOWN`, not a retry; nothing is `VERIFIED` on the actor's say-so. Found the STOP-demotion defect on 2026-09-07, applied the three STOP-dominance patches by hand and accepted the regression test; review and acceptance of every evidence run.
- AI coding assistants: implementation of the TypeScript runtime, the SQL migrations and the test suites (2026-08); the regression test of 2026-09-07; the 2026-10-26 reproduction, the type-error finding and its one-line fix, and the preparation of this folder.
