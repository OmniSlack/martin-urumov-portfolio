import {
  assertAttemptTransition,
  assertPermitTransition,
  dependencyDigest,
  envelopeDigest,
  parseActionEnvelope,
} from "../src/index.ts";
import type {
  ActionEnvelope,
  AdapterStartPort,
  AttemptSnapshot,
  CoreDecisionSnapshot,
  CoreDecisionState,
  PermitSnapshot,
} from "../src/index.ts";
import type { ClaimInput, ControlRepository, DispatchInput, DispatchReservation } from "../src/repository.ts";
import type { JsonValue } from "../src/model.ts";

export const envelopeInput = Object.freeze({
  proposalId: "proposal-1",
  action: "MOCK_ACTION",
  object: "object-A",
  target: "target-A",
  scope: ["scope-A"],
  version: "v1",
  dependencies: { depA: "1" },
  expectedEffect: "mock effect",
  constraints: ["mock-only"],
  reversible: "REVERSIBLE",
  provenance: ["human-input"],
  unresolvedUncertainty: [],
});

export function envelope(): ActionEnvelope { return parseActionEnvelope(envelopeInput); }

export class FakeRepository implements ControlRepository {
  public readonly permits = new Map<string, PermitSnapshot>();
  public readonly attempts = new Map<string, AttemptSnapshot>();
  public readonly holds = new Map<string, string>();
  public readonly coreDecisions = new Map<string, CoreDecisionSnapshot>();
  public gate: "OPEN" | "HOLD" | "STOP" | "UNKNOWN" = "OPEN";
  public currentVersion = "v1";
  public currentDependencyDigest = dependencyDigest(envelope().dependencies);
  public stateKnown = true;
  public now = Date.parse("2030-01-01T00:00:00.000Z");
  public reservationReleaseCount = 0;

  public async issuePermit(permitId: string, value: ActionEnvelope, digest: string, issuedAt: string, expiresAt: string): Promise<PermitSnapshot> {
    this.validateDualGate(value, digest, dependencyDigest(value.dependencies));
    if (this.permits.has(permitId)) throw new Error("duplicate permit");
    const permit: PermitSnapshot = { id: permitId, envelope: value, envelopeDigest: digest, state: "ISSUED", issuedAt, expiresAt, claimedAttemptId: null, revision: 0 };
    this.permits.set(permitId, permit);
    return permit;
  }
  public async revokePermit(permitId: string, _reason: string): Promise<PermitSnapshot> {
    const permit = this.mustPermit(permitId);
    assertPermitTransition(permit.state, "REVOKED");
    const next = { ...permit, state: "REVOKED" as const, revision: permit.revision + 1 };
    this.permits.set(permitId, next);
    return next;
  }
  public async addHold(holdId: string, reason: string, _provenance: string): Promise<void> {
    if (this.holds.has(holdId)) throw new Error("duplicate HOLD ID");
    this.holds.set(holdId, reason);
    // STOP is dominant: a later HOLD must not demote it (defect fixed 2026-09-07).
    if (this.gate !== "STOP") this.gate = "HOLD";
  }
  public async resolveExactHold(holdId: string, _resolutionEvidence: string, _provenance: string): Promise<void> {
    if (!this.holds.delete(holdId)) throw new Error("exact HOLD does not exist");
    // The 2026-09-07 patch nested this guard twice; the inner duplicate failed `tsc` (TS2367, type already
    // narrowed) without changing behaviour. One guard, same semantics (fixed 2026-10-26).
    if (this.gate !== "STOP") this.gate = this.holds.size === 0 ? "OPEN" : "HOLD";
  }
  public async recordCoreDecision(proposalId: string, digest: string, version: string, depDigest: string, decision: CoreDecisionState, reason: string, provenance: string): Promise<CoreDecisionSnapshot> {
    const previous = this.coreDecisions.get(proposalId);
    const snapshot: CoreDecisionSnapshot = {
      proposalId,
      envelopeDigest: digest,
      version,
      dependencyDigest: depDigest,
      decision,
      reason,
      provenance,
      revision: (previous?.revision ?? -1) + 1,
    };
    this.coreDecisions.set(proposalId, snapshot);
    return snapshot;
  }
  public async observeState(_scopeId: string, version: string, digest: string, known: boolean): Promise<void> {
    this.currentVersion = version; this.currentDependencyDigest = digest; this.stateKnown = known;
  }
  public async stop(_reason: string): Promise<void> { this.gate = "STOP"; }
  public async markGateUnknown(_reason: string): Promise<void> { this.gate = "UNKNOWN"; }
  public async atomicClaim(input: ClaimInput): Promise<{ readonly permit: PermitSnapshot; readonly attempt: AttemptSnapshot }> {
    const permit = this.mustPermit(input.permitId);
    this.validate(permit, input.envelope, input.envelopeDigest, input.dependencyDigest, "ISSUED");
    if (permit.claimedAttemptId !== null || [...this.attempts.values()].some((a) => a.permitId === permit.id)) throw new Error("already claimed");
    const requested: AttemptSnapshot = { id: input.attemptId, permitId: permit.id, proposalId: input.envelope.proposalId, state: "REQUESTED", dispatchFence: null, adapterOutcome: null, verificationOutcome: null, invocationStarted: false, revision: 0 };
    assertAttemptTransition("REQUESTED", "CLAIMED", false);
    const attempt = { ...requested, state: "CLAIMED" as const, revision: 1 };
    assertPermitTransition("ISSUED", "CLAIMED");
    const claimed = { ...permit, state: "CLAIMED" as const, claimedAttemptId: attempt.id, revision: permit.revision + 1 };
    this.attempts.set(attempt.id, attempt); this.permits.set(permit.id, claimed);
    return { permit: claimed, attempt };
  }
  public async reserveDispatch(input: DispatchInput): Promise<DispatchReservation> {
    const attempt = this.mustAttempt(input.attemptId);
    const permit = this.mustPermit(attempt.permitId);
    if (attempt.state !== "CLAIMED" || attempt.dispatchFence !== null) throw new Error("attempt not dispatchable");
    try {
      this.validate(permit, input.envelope, input.envelopeDigest, input.dependencyDigest, "CLAIMED");
    } catch (error) {
      if (this.mustPermit(permit.id).state === "EXPIRED") {
        assertAttemptTransition(attempt.state, "CANCELLED", false);
        this.attempts.set(attempt.id, { ...attempt, state: "CANCELLED", revision: attempt.revision + 1 });
      }
      throw error;
    }
    const reserved = { ...attempt, dispatchFence: input.fence, revision: attempt.revision + 1 };
    this.attempts.set(attempt.id, reserved);
    let released = false;
    return { permit, attempt: reserved, release: async () => { if (!released) { released = true; this.reservationReleaseCount += 1; } } };
  }
  public recordAdapterStart(id: string, fence: string, report: JsonValue | null): Promise<AttemptSnapshot> { return this.startTransition(id, fence, "ATTEMPTED", true, report); }
  public recordNoStart(id: string, fence: string): Promise<AttemptSnapshot> { return this.startTransition(id, fence, "CANCELLED", false, null); }
  public recordAmbiguousStart(id: string, fence: string, evidence: string): Promise<AttemptSnapshot> { return this.startTransition(id, fence, "UNKNOWN", false, { evidence }); }
  public async failClosedAbandoned(id: string, evidence: string): Promise<AttemptSnapshot> {
    const attempt = this.mustAttempt(id);
    const permit = this.mustPermit(attempt.permitId);
    assertPermitTransition(permit.state, "UNKNOWN");
    assertAttemptTransition(attempt.state, "UNKNOWN", attempt.invocationStarted);
    const unknownPermit = { ...permit, state: "UNKNOWN" as const, revision: permit.revision + 1 };
    const next = { ...attempt, state: "UNKNOWN" as const, adapterOutcome: { evidence }, revision: attempt.revision + 1 };
    this.permits.set(permit.id, unknownPermit); this.attempts.set(id, next); return next;
  }
  public async getPermit(id: string): Promise<PermitSnapshot | null> { return this.permits.get(id) ?? null; }
  public async getAttempt(id: string): Promise<AttemptSnapshot | null> { return this.attempts.get(id) ?? null; }

  private validate(permit: PermitSnapshot, value: ActionEnvelope, digest: string, depDigest: string, requiredState: "ISSUED" | "CLAIMED"): void {
    this.validateDualGate(value, digest, depDigest);
    if (permit.state !== requiredState) throw new Error("permit state mismatch");
    if (this.now >= Date.parse(permit.expiresAt)) {
      assertPermitTransition(permit.state, "EXPIRED");
      this.permits.set(permit.id, { ...permit, state: "EXPIRED", revision: permit.revision + 1 });
      throw new Error("permit expired");
    }
    if (digest !== permit.envelopeDigest || digest !== envelopeDigest(value)) throw new Error("envelope mismatch");
    if (value.version !== this.currentVersion || depDigest !== this.currentDependencyDigest) throw new Error("state/dependency drift");
  }
  private validateDualGate(value: ActionEnvelope, digest: string, depDigest: string): void {
    if (this.gate !== "OPEN" || this.holds.size > 0) throw new Error("gate closed");
    if (!this.stateKnown) throw new Error("state UNKNOWN");
    if (value.version !== this.currentVersion || depDigest !== this.currentDependencyDigest) throw new Error("state/dependency drift");
    const core = this.coreDecisions.get(value.proposalId);
    if (!core || core.decision !== "CLEAR") throw new Error("exact Core CLEAR required");
    if (core.envelopeDigest !== digest || digest !== envelopeDigest(value) || core.version !== value.version || core.dependencyDigest !== depDigest) {
      throw new Error("Core CLEAR binding mismatch");
    }
  }
  private async startTransition(id: string, fence: string, state: "ATTEMPTED" | "CANCELLED" | "UNKNOWN", started: boolean, report: JsonValue | null): Promise<AttemptSnapshot> {
    const attempt = this.mustAttempt(id);
    if (attempt.dispatchFence !== fence) throw new Error("stale fence");
    assertAttemptTransition(attempt.state, state, started);
    const next = { ...attempt, state, invocationStarted: started, adapterOutcome: report, revision: attempt.revision + 1 };
    this.attempts.set(id, next); return next;
  }
  private mustPermit(id: string): PermitSnapshot { const value = this.permits.get(id); if (!value) throw new Error("permit missing"); return value; }
  private mustAttempt(id: string): AttemptSnapshot { const value = this.attempts.get(id); if (!value) throw new Error("attempt missing"); return value; }
}

export class MockAdapter implements AdapterStartPort {
  public calls = 0;
  public mode: "START" | "NO_START" | "THROW" = "START";
  public async start(_envelope: ActionEnvelope, _fence: string) {
    this.calls += 1;
    if (this.mode === "THROW") throw new Error("ambiguous adapter boundary");
    if (this.mode === "NO_START") return { started: false, report: null };
    return { started: true, report: { status: "SUCCESS_REPORTED_NOT_VERIFIED" } };
  }
}

export async function issueValid(repository: FakeRepository, permitId = "permit-1"): Promise<PermitSnapshot> {
  const value = envelope();
  await repository.recordCoreDecision(value.proposalId, envelopeDigest(value), value.version, dependencyDigest(value.dependencies), "CLEAR", "mock test clearance", "core-test");
  return repository.issuePermit(permitId, value, envelopeDigest(value), "2029-12-31T00:00:00.000Z", "2030-01-02T00:00:00.000Z");
}
